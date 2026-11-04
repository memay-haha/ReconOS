#!/usr/bin/env python3
"""
PR Analyzer: phân tích độ phức tạp của PR và gợi ý cách review.

Cách dùng:
    python3 pr-analyzer.py [--diff-file FILE] [--stats]

    Hoặc đưa diff qua stdin:
    git diff main...HEAD | python3 pr-analyzer.py
"""

import os
import sys
import re
import argparse
from collections import defaultdict
from dataclasses import dataclass
from typing import List, Dict, Optional

RISK_NO_TESTS = "NO_TEST_CHANGES"


@dataclass
class FileStats:
    """Thống kê cho một file."""
    filename: str
    additions: int = 0
    deletions: int = 0
    is_test: bool = False
    is_config: bool = False
    language: str = "unknown"


@dataclass
class PRAnalysis:
    """Kết quả phân tích đầy đủ của một PR."""
    total_files: int
    total_additions: int
    total_deletions: int
    files: List[FileStats]
    complexity_score: float
    size_category: str
    estimated_review_time: int
    risk_factors: List[str]
    suggestions: List[str]


def detect_language(filename: str) -> str:
    """Nhận diện ngôn ngữ lập trình theo đuôi file."""
    _, ext = os.path.splitext(filename)
    extensions = {
        '.py': 'Python',
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.tsx': 'TypeScript/React',
        '.jsx': 'JavaScript/React',
        '.rs': 'Rust',
        '.go': 'Go',
        '.c': 'C',
        '.h': 'C/C++',
        '.cpp': 'C++',
        '.hpp': 'C++',
        '.cc': 'C++',
        '.cxx': 'C++',
        '.hh': 'C++',
        '.hxx': 'C++',
        '.java': 'Java',
        '.kt': 'Kotlin',
        '.swift': 'Swift',
        '.rb': 'Ruby',
        '.php': 'PHP',
        '.cs': 'C#',
        '.vue': 'Vue',
        '.svelte': 'Svelte',
        '.sql': 'SQL',
        '.md': 'Markdown',
        '.json': 'JSON',
        '.yaml': 'YAML',
        '.yml': 'YAML',
        '.toml': 'TOML',
        '.css': 'CSS',
        '.scss': 'SCSS',
        '.less': 'Less',
        '.html': 'HTML',
        '.zig': 'Zig',
        '.ex': 'Elixir',
        '.exs': 'Elixir',
        '.erl': 'Erlang',
        '.scala': 'Scala',
        '.lua': 'Lua',
    }
    return extensions.get(ext.lower(), 'unknown')


def is_test_file(filename: str) -> bool:
    """Kiểm tra file có phải file test không."""
    test_patterns = [
        r'(?:^|/)test_[^/]+\.py$',   # Python: test_handler.py (neo vào đầu đoạn đường dẫn)
        r'[^/]+_test\.',             # *_test.<ext>: Rust, Go...
        r'[^/]+\.test\.(js|ts|tsx|jsx)$',  # JS/TS: handler.test.ts
        r'[^/]+\.spec\.(js|ts|tsx|jsx)$',  # JS/TS: handler.spec.ts
        r'(?:^|/)tests?/',           # thư mục tests/ hoặc test/
        r'(?:^|/)__tests__/',        # thư mục __tests__/
        r'(?:^|/)spec/',             # thư mục spec/ (Ruby...)
    ]
    return any(re.search(p, filename) for p in test_patterns)


def is_config_file(filename: str) -> bool:
    """Kiểm tra file có phải file cấu hình không.

    So khớp theo danh sách tên đã biết để không nhận nhầm file dữ liệu
    như data.json, openapi.yaml, swagger.json là file cấu hình.
    """
    basename = os.path.basename(filename)

    # File env (.env, .env.local, .env.production...)
    if basename.startswith('.env'):
        return True

    # Tên file cấu hình đã biết (khớp chính xác)
    known_config_names = {
        'package.json', 'package-lock.json',
        'tsconfig.json', 'jsconfig.json',
        'babel.config.json', 'babel.config.js',
        'webpack.config.js', 'webpack.config.ts',
        'rollup.config.js', 'vite.config.ts', 'vite.config.js',
        '.eslintrc.json', '.eslintrc.js', '.eslintrc.yml',
        '.prettierrc.json', '.prettierrc.yml', '.prettierrc.js',
        'jest.config.js', 'jest.config.ts',
        'vitest.config.ts', 'vitest.config.js',
        'tailwind.config.js', 'tailwind.config.ts',
        'postcss.config.js',
        'docker-compose.yml', 'docker-compose.yaml',
        'Dockerfile',
        'Makefile', 'CMakeLists.txt',
        'pyproject.toml', 'poetry.toml', 'Pipfile',
        'setup.cfg', 'setup.py', 'tox.ini',
        'Cargo.toml', 'Cargo.lock',
        'go.mod', 'go.sum',
        'Gemfile', 'Gemfile.lock',
        'composer.json', 'composer.lock',
        'Podfile', 'Package.swift',
        '.gitignore', '.gitattributes',
        'gradle.properties', 'build.gradle', 'build.gradle.kts',
        'settings.gradle', 'settings.gradle.kts',
    }
    if basename in known_config_names:
        return True

    # Mẫu đường dẫn cấu hình đã biết
    config_path_patterns = [
        r'\.github/workflows/[^/]+\.ya?ml$',
        r'\.vscode/',
        r'\.idea/',
    ]
    if any(re.search(p, filename) for p in config_path_patterns):
        return True

    # File có "config" trong tên (ví dụ app.config.ts, database_config.yml)
    if re.search(r'config\.', basename):
        return True

    # File nằm trong thư mục config/
    if re.search(r'(?:^|/)config/', filename):
        return True

    return False


def parse_diff(diff_content: str) -> List[FileStats]:
    """Phân tích output git diff và lấy thống kê từng file."""
    files = []
    current_file = None

    for line in diff_content.split('\n'):
        # Header của file mới
        if line.startswith('diff --git'):
            if current_file:
                files.append(current_file)
            # "diff --git a/<path> b/<path>": khớp phía b/ bằng backreference
            # để chuỗi "b/" nằm trong đường dẫn như lib/, web/, db/ không bị
            # nhận nhầm là tiền tố. Khi đổi tên, hai đường dẫn khác nhau nên
            # lấy phía b/ sau dấu cách phân tách.
            match = re.match(r'diff --git a/(.+?) b/\1', line)
            if not match:
                match = re.search(r' b/(.+)$', line)
            if match:
                filename = match.group(1)
                current_file = FileStats(
                    filename=filename,
                    language=detect_language(filename),
                    is_test=is_test_file(filename),
                    is_config=is_config_file(filename),
                )
            else:
                current_file = None
        elif current_file:
            if line.startswith('+') and not line.startswith('+++'):
                current_file.additions += 1
            elif line.startswith('-') and not line.startswith('---'):
                current_file.deletions += 1

    if current_file:
        files.append(current_file)

    return files


def calculate_complexity(files: List[FileStats]) -> float:
    """Tính điểm phức tạp (thang 0-1)."""
    if not files:
        return 0.0

    total_changes = sum(f.additions + f.deletions for f in files)

    # Độ phức tạp gốc theo kích thước
    size_factor = min(total_changes / 1000, 1.0)

    # Hệ số theo số file
    file_factor = min(len(files) / 20, 1.0)

    # Hệ số theo tỷ lệ mã không phải test
    test_lines = sum(f.additions + f.deletions for f in files if f.is_test)
    non_test_ratio = 1 - (test_lines / max(total_changes, 1))

    # Hệ số theo số ngôn ngữ
    languages = set(f.language for f in files if f.language != 'unknown')
    lang_factor = min(len(languages) / 5, 1.0)

    complexity = (
        size_factor * 0.4 +
        file_factor * 0.2 +
        non_test_ratio * 0.2 +
        lang_factor * 0.2
    )

    return round(complexity, 2)


def categorize_size(total_changes: int) -> str:
    """Xếp loại kích thước PR."""
    if total_changes < 50:
        return "XS (rất nhỏ)"
    elif total_changes < 200:
        return "S (nhỏ)"
    elif total_changes < 400:
        return "M (vừa)"
    elif total_changes < 800:
        return "L (lớn)"
    else:
        return "XL (rất lớn): nên tách nhỏ"


def estimate_review_time(files: List[FileStats], complexity: float) -> int:
    """Ước lượng thời gian review, tính bằng phút."""
    total_changes = sum(f.additions + f.deletions for f in files)

    # Thời gian gốc: khoảng 1 phút cho 20 dòng
    base_time = total_changes / 20

    # Điều chỉnh theo độ phức tạp
    adjusted_time = base_time * (1 + complexity)

    # Tối thiểu 5 phút, tối đa 120 phút
    return max(5, min(120, int(adjusted_time)))


def identify_risk_factors(files: List[FileStats]) -> List[str]:
    """Xác định yếu tố rủi ro của PR."""
    risks = []

    total_changes = sum(f.additions + f.deletions for f in files)
    test_changes = sum(f.additions + f.deletions for f in files if f.is_test)

    if total_changes > 400:
        risks.append("PR lớn (>400 dòng): khó review kỹ")

    if test_changes == 0 and total_changes > 50:
        risks.append(f"{RISK_NO_TESTS}: không đổi test, kiểm tra độ phủ test")

    if total_changes > 100 and test_changes / max(total_changes, 1) < 0.2:
        risks.append("Tỷ lệ test thấp (<20%): cân nhắc thêm test")

    # File nhạy cảm về bảo mật
    security_patterns = ['.env', 'auth', 'security', 'password', 'token', 'secret']
    for f in files:
        if any(p in f.filename.lower() for p in security_patterns):
            risks.append(f"File nhạy cảm về bảo mật: {f.filename}")
            break

    # Thay đổi CSDL
    for f in files:
        if 'migration' in f.filename.lower() or f.language == 'SQL':
            risks.append("Có thay đổi CSDL: review cẩn thận")
            break

    # Thay đổi cấu hình
    config_files = [f for f in files if f.is_config]
    if config_files:
        risks.append(f"Thay đổi cấu hình ở {len(config_files)} file")

    return risks


def generate_suggestions(files: List[FileStats], complexity: float, risks: List[str]) -> List[str]:
    """Sinh gợi ý review."""
    suggestions = []

    total_changes = sum(f.additions + f.deletions for f in files)

    if total_changes > 800:
        suggestions.append("Cân nhắc tách PR thành nhiều thay đổi nhỏ, tập trung")

    if complexity > 0.7:
        suggestions.append("Độ phức tạp cao: dành thêm thời gian review")
        suggestions.append("Cân nhắc review theo cặp cho phần quan trọng")

    if any(RISK_NO_TESTS in r for r in risks):
        suggestions.append("Yêu cầu bổ sung test trước khi duyệt")

    # Gợi ý theo ngôn ngữ
    languages = set(f.language for f in files)
    if 'TypeScript' in languages or 'TypeScript/React' in languages:
        suggestions.append("Kiểm tra cách dùng kiểu (tránh 'any')")
    if 'Rust' in languages:
        suggestions.append("Kiểm tra chỗ dùng unwrap() và xử lý lỗi")
    if 'C' in languages or 'C++' in languages or 'C/C++' in languages:
        suggestions.append("Kiểm tra an toàn bộ nhớ, kiểm tra biên và rủi ro UB")
    if 'SQL' in languages:
        suggestions.append("Review SQL injection và hiệu năng truy vấn")

    if not suggestions:
        suggestions.append("Quy trình review thông thường là đủ")

    return suggestions


def analyze_pr(diff_content: str) -> PRAnalysis:
    """Phân tích đầy đủ một PR."""
    files = parse_diff(diff_content)

    total_additions = sum(f.additions for f in files)
    total_deletions = sum(f.deletions for f in files)
    total_changes = total_additions + total_deletions

    complexity = calculate_complexity(files)
    risks = identify_risk_factors(files)
    suggestions = generate_suggestions(files, complexity, risks)

    return PRAnalysis(
        total_files=len(files),
        total_additions=total_additions,
        total_deletions=total_deletions,
        files=files,
        complexity_score=complexity,
        size_category=categorize_size(total_changes),
        estimated_review_time=estimate_review_time(files, complexity),
        risk_factors=risks,
        suggestions=suggestions,
    )


def print_analysis(analysis: PRAnalysis, show_files: bool = False):
    """In kết quả phân tích."""
    print("\n" + "=" * 60)
    print("BÁO CÁO PHÂN TÍCH PR")
    print("=" * 60)

    print(f"\n📊 TÓM TẮT")
    print(f"   Số file thay đổi: {analysis.total_files}")
    print(f"   Dòng thêm: +{analysis.total_additions}")
    print(f"   Dòng xóa: -{analysis.total_deletions}")
    print(f"   Tổng thay đổi: {analysis.total_additions + analysis.total_deletions}")

    print(f"\n📏 KÍCH THƯỚC: {analysis.size_category}")
    print(f"   Điểm phức tạp: {analysis.complexity_score}/1.0")
    print(f"   Thời gian review ước tính: ~{analysis.estimated_review_time} phút")

    if analysis.risk_factors:
        print(f"\n⚠️  YẾU TỐ RỦI RO:")
        for risk in analysis.risk_factors:
            print(f"   • {risk}")

    print(f"\n💡 GỢI Ý:")
    for suggestion in analysis.suggestions:
        print(f"   • {suggestion}")

    if show_files:
        print(f"\n📁 DANH SÁCH FILE:")
        # Nhóm theo ngôn ngữ
        by_lang: Dict[str, List[FileStats]] = defaultdict(list)
        for f in analysis.files:
            by_lang[f.language].append(f)

        for lang, lang_files in sorted(by_lang.items()):
            print(f"\n   [{lang}]")
            for f in lang_files:
                prefix = "🧪" if f.is_test else "⚙️" if f.is_config else "📄"
                print(f"   {prefix} {f.filename} (+{f.additions}/-{f.deletions})")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description='Phân tích độ phức tạp của PR')
    parser.add_argument('--diff-file', '-f', help='Đường dẫn tới file diff')
    parser.add_argument('--stats', '-s', action='store_true', help='Hiện chi tiết từng file')
    args = parser.parse_args()

    # Đọc diff từ file hoặc stdin
    try:
        if args.diff_file:
            with open(args.diff_file, 'r', encoding='utf-8', errors='replace') as f:
                diff_content = f.read()
        elif not sys.stdin.isatty():
            diff_content = sys.stdin.buffer.read().decode('utf-8', errors='replace')
        else:
            print("Cách dùng: git diff main...HEAD | python3 pr-analyzer.py")
            print("           python3 pr-analyzer.py -f diff.txt")
            sys.exit(1)
    except OSError as e:
        print(f"Lỗi khi đọc diff: {e}", file=sys.stderr)
        sys.exit(1)

    if not diff_content.strip():
        print("Không có nội dung diff")
        sys.exit(1)

    analysis = analyze_pr(diff_content)
    print_analysis(analysis, show_files=args.stats)


if __name__ == '__main__':
    main()
