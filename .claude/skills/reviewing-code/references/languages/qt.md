# Qt

Dùng khi review code Qt 5.15 / Qt 6: object model, signal/slot, Model/View, QML, chuyển sang Qt6, event loop, test và hiệu năng GUI.

## Object model và quản lý bộ nhớ

### Dùng cơ chế sở hữu cha-con

Cây `QObject` của Qt tự quản lý bộ nhớ. Với `QObject`, ưu tiên đặt object cha thay vì `delete` thủ công hoặc smart pointer.

```cpp
// ❌ Quản lý thủ công, dễ rò rỉ bộ nhớ
QWidget* w = new QWidget();
QLabel* l = new QLabel();
l->setParent(w);
// ... Nếu w bị xóa, l tự bị xóa. Nhưng nếu w rò rỉ thì l cũng rò rỉ.

// ✅ Chỉ định cha trong constructor
QWidget* w = new QWidget(this); // 'this' sở hữu
QLabel* l = new QLabel(w);      // 'w' sở hữu
```

### Dùng smart pointer với QObject

Nếu `QObject` không có cha, dùng `QScopedPointer` hoặc `std::unique_ptr` với deleter tùy biến (dùng `deleteLater` nếu khác thread). Tránh `std::shared_ptr` cho `QObject` trừ khi cần, vì `shared_ptr` làm rối hệ thống sở hữu cha-con.

```cpp
// ✅ Scoped pointer cho QObject cục bộ/thành viên không có cha
QScopedPointer<MyObject> obj(new MyObject());

// ✅ Con trỏ an toàn để tránh con trỏ treo
QPointer<MyObject> safePtr = obj.data();
if (safePtr) {
    safePtr->doSomething();
}
```

### Dùng `deleteLater()`

Khi cần xóa bất đồng bộ, đặc biệt trong slot hoặc event handler, dùng `deleteLater()` thay `delete` để event đang chờ trong event loop được xử lý xong.

```cpp
// ❌ Sai: delete trong slot có thể làm sender mất hiệu lực khi đang phát signal
void MyWidget::onFinished() {
    delete this;  // UB: có thể được gọi từ trong chuỗi signal
}

// ✅ Đúng: xóa hoãn an toàn
void MyWidget::onFinished() {
    deleteLater();
}
```

### Tránh sở hữu kép

```cpp
// ❌ Sai: cha sở hữu dialog, nhưng còn lưu trong unique_ptr
auto dialog = std::make_unique<QDialog>(this);  // 'this' là cha, unique_ptr cũng sở hữu

// ✅ Đúng: cha sở hữu, con trỏ thô chỉ để truy cập
auto* dialog = new QDialog(this);
```

## Signal và slot

### Ưu tiên cú pháp con trỏ hàm

Dùng cú pháp kiểm tra lúc biên dịch (Qt 5+).

```cpp
// ❌ Dựa trên chuỗi (chỉ kiểm tra lúc chạy, chậm hơn)
connect(sender, SIGNAL(valueChanged(int)), receiver, SLOT(updateValue(int)));

// ✅ Kiểm tra lúc biên dịch
connect(sender, &Sender::valueChanged, receiver, &Receiver::updateValue);
```

### Kết nối lambda: chỉ định context object

```cpp
// ❌ Sai: lambda bắt `this` thô, crash nếu object đã bị xóa
connect(timer, &QTimer::timeout, [this]() {
    update();  // crash nếu 'this' đã hủy
});

// ✅ Đúng: context object tự ngắt kết nối khi bị hủy
connect(timer, &QTimer::timeout, this, [this]() {
    update();
});
```

### Kiểu kết nối

Nêu rõ hoặc nắm được kiểu kết nối khi đi qua nhiều thread.
- `Qt::AutoConnection` (mặc định): Direct nếu cùng thread, Queued nếu khác thread.
- `Qt::QueuedConnection`: luôn đăng event (an toàn giữa các thread).
- `Qt::DirectConnection`: gọi ngay (nguy hiểm nếu truy cập dữ liệu không thread-safe giữa các thread).

### Tránh vòng lặp signal

Kiểm tra logic có thể gây vòng lặp signal vô hạn (ví dụ `valueChanged` -> `setValue` -> `valueChanged`). Chặn signal hoặc so sánh bằng trước khi gán.

```cpp
void MyClass::setValue(int v) {
    if (m_value == v) return; // ✅ Đúng: cắt vòng lặp
    m_value = v;
    emit valueChanged(v);
}
```

### Ngắt kết nối khi cần

```cpp
// ✅ Đúng: ngắt kết nối tường minh trước khi đổi nguồn
disconnect(oldSource, &Source::data, this, &Receiver::onData);
connect(newSource, &Source::data, this, &Receiver::onData);
```

## Container và chuỗi

### Hiệu quả của QString

- Dùng `QStringLiteral("...")` để tạo chuỗi lúc biên dịch, tránh cấp phát lúc chạy.
- Dùng `QLatin1String` khi so sánh với literal ASCII (Qt 5).
- Ưu tiên `arg()` để định dạng (hoặc toán tử `%` của `QStringBuilder`).

```cpp
// ❌ Chuyển đổi lúc chạy
if (str == "test") ...

// ✅ Ưu tiên QLatin1String khi so sánh với literal ASCII (Qt 5)
if (str == QLatin1String("test")) ... // Qt 5
if (str == u"test"_s) ...             // Qt 6
```

### Chọn container

- **Qt 6**: `QList` là lựa chọn mặc định (đã hợp nhất với `QVector`).
- **Qt 5**: ưu tiên `QVector` hơn `QList` vì bộ nhớ liên tục và hiệu năng cache, trừ khi cần tham chiếu ổn định.
- Chú ý Implicit Sharing (Copy-on-Write). Truyền container theo giá trị rẻ cho tới khi bị sửa. Dùng `const &` khi chỉ đọc.

```cpp
// ❌ Buộc sao chép sâu nếu hàm sửa 'list'
void process(QVector<int> list) {
    list[0] = 1;
}

// ✅ Tham chiếu chỉ đọc
void process(const QVector<int>& list) { ... }
```

### Dùng constBegin/constEnd khi duyệt chỉ đọc

```cpp
// ❌ Sai: begin()/end() có thể kích hoạt detach
for (auto it = list.begin(); it != list.end(); ++it) {
    qDebug() << *it;
}

// ✅ Đúng: duyệt const tránh detach
for (auto it = list.constBegin(); it != list.constEnd(); ++it) {
    qDebug() << *it;
}

// ✅ Tốt nhất: range-based for với const ref (Qt 5.7+)
for (const auto& item : list) {
    qDebug() << item;
}
```

## Thread và đồng thời

### Kế thừa QThread và worker object

Ưu tiên mẫu "worker object" thay vì kế thừa `QThread` và viết logic trong class con đó.

```cpp
// ❌ Logic nghiệp vụ trong QThread::run()
class MyThread : public QThread {
    void run() override { ... }
};

// ✅ Worker object được chuyển sang thread
QThread* thread = new QThread;
Worker* worker = new Worker;
worker->moveToThread(thread);
connect(thread, &QThread::started, worker, &Worker::process);
connect(thread, &QThread::finished, worker, &QObject::deleteLater);
thread->start();
```

### An toàn thread của GUI

Không bao giờ truy cập widget (`QWidget` và class con) từ thread nền (P0: crash). Dùng signal/slot để gửi cập nhật về main thread.

```cpp
// ❌ Sai: truy cập widget từ worker thread
void Worker::onResult(Data data) {
    label->setText(data.toString());  // crash: không ở main thread
}

// ✅ Đúng: phát signal về main thread
void Worker::onResult(Data data) {
    emit resultReady(data);  // kết nối qua QueuedConnection
}
// Ở main thread:
connect(worker, &Worker::resultReady, this, [this](const Data& d) {
    label->setText(d.toString());
});
```

### QtConcurrent cho song song đơn giản

```cpp
// ✅ Đúng: tính toán song song đơn giản
auto future = QtConcurrent::run([data]() {
    return heavyComputation(data);
});

// ✅ Đúng: mẫu map-reduce
auto results = QtConcurrent::mappedReduced(
    inputList,
    [](const Item& item) { return process(item); },
    [](int& result, int value) { result += value; }
);
```

## GUI và widget

### Tách logic

Giữ logic nghiệp vụ ngoài class UI (`MainWindow`, `Dialog`). Class UI chỉ hiển thị và chuyển tiếp đầu vào người dùng.

### Layout

Tránh kích thước cố định (`setGeometry`, `resize`). Dùng layout (`QVBoxLayout`, `QGridLayout`) để xử lý DPI khác nhau và thay đổi kích thước cửa sổ.

### Chặn event loop

Không bao giờ chạy thao tác lâu trên main thread (đóng băng GUI).
- **Sai**: `Sleep()`, `while(busy)`, gọi mạng đồng bộ.
- **Đúng**: `QProcess`, `QThread`, `QtConcurrent`, hoặc API bất đồng bộ (`QNetworkAccessManager`).

### Co giãn High-DPI

```cpp
// ✅ Qt 5: bật co giãn high-DPI
QGuiApplication::setAttribute(Qt::AA_EnableHighDpiScaling);

// ✅ Qt 6: bật mặc định, nhưng kiểm tra icon và phần tự vẽ co giãn đúng
```

## Kiến trúc Model/View

### Kế thừa QAbstractItemModel đúng cách

Khi viết model tùy biến, các method sau là **bắt buộc**:

```cpp
class TaskModel : public QAbstractTableModel {
    Q_OBJECT
public:
    int rowCount(const QModelIndex& parent = {}) const override {
        if (parent.isValid()) return 0;  // model bảng không có cây
        return m_tasks.size();
    }

    int columnCount(const QModelIndex& parent = {}) const override {
        if (parent.isValid()) return 0;
        return 3;  // title, priority, status
    }

    QVariant data(const QModelIndex& index, int role) const override {
        if (!index.isValid() || index.row() >= m_tasks.size())
            return {};

        if (role == Qt::DisplayRole) {
            switch (index.column()) {
                case 0: return m_tasks[index.row()].title;
                case 1: return m_tasks[index.row()].priority;
                case 2: return m_tasks[index.row()].status;
            }
        }
        return {};
    }

    // Cần cho tiêu đề
    QVariant headerData(int section, Qt::Orientation orientation, int role) const override {
        if (role != Qt::DisplayRole) return {};
        if (orientation == Qt::Horizontal) {
            switch (section) {
                case 0: return "Title";
                case 1: return "Priority";
                case 2: return "Status";
            }
        }
        return section + 1;  // số dòng
    }

private:
    QVector<Task> m_tasks;
};
```

### Báo view khi dữ liệu đổi

```cpp
// ❌ Sai: sửa dữ liệu mà không báo view
void TaskModel::addTask(const Task& task) {
    m_tasks.append(task);  // view không biết có thay đổi
}

// ✅ Đúng: phát signal đúng
void TaskModel::addTask(const Task& task) {
    beginInsertRows({}, m_tasks.size(), m_tasks.size());
    m_tasks.append(task);
    endInsertRows();
}

void TaskModel::updateStatus(int row, const QString& status) {
    m_tasks[row].status = status;
    emit dataChanged(index(row, 2), index(row, 2), {Qt::DisplayRole});
}

void TaskModel::clearAll() {
    beginResetModel();
    m_tasks.clear();
    endResetModel();
}
```

### Mẫu delegate cho render tùy biến

```cpp
class PriorityDelegate : public QStyledItemDelegate {
    Q_OBJECT
public:
    void paint(QPainter* painter, const QStyleOptionViewItem& option,
               const QModelIndex& index) const override {
        QStyleOptionViewItem opt = option;
        initStyleOption(&opt, index);

        // Tô màu theo priority
        QString priority = index.data().toString();
        if (priority == "High") {
            opt.backgroundBrush = QColor("#ffcccc");
        } else if (priority == "Low") {
            opt.backgroundBrush = QColor("#ccffcc");
        }

        QStyledItemDelegate::paint(painter, opt, index);
    }
};

// Cách dùng:
tableView->setItemDelegateForColumn(1, new PriorityDelegate(this));
```

### Hiệu năng với tập dữ liệu lớn

- Dùng `beginInsertRows`/`endInsertRows` để chèn theo lô, không chèn từng dòng.
- Với 100.000+ dòng, cân nhắc `QSortFilterProxyModel` để lọc thay vì truy vấn lại.
- Dùng `model()->fetchMore()` để lazy loading / phân trang.
- Tránh `Qt::UserRole + N` mang object nặng, dùng khóa nhẹ và tra cứu bên ngoài.

## Hệ thống meta-object

### Property và enum

Dùng `Q_PROPERTY` cho giá trị cần đưa ra QML hoặc cần introspection. Dùng `Q_ENUM` để chuyển enum sang chuỗi.

```cpp
class MyObject : public QObject {
    Q_OBJECT
    Q_PROPERTY(int value READ value WRITE setValue NOTIFY valueChanged)
public:
    enum State { Idle, Running };
    Q_ENUM(State)
    // ...
};
```

### qobject_cast

Dùng `qobject_cast<T*>` cho QObject thay vì `dynamic_cast`. Cách này nhanh hơn và không cần RTTI.

### Q_GADGET cho kiểu giá trị

```cpp
// ✅ Đúng: introspection không tốn chi phí của QObject
struct Coordinate {
    Q_GADGET
    Q_PROPERTY(double x MEMBER x)
    Q_PROPERTY(double y MEMBER y)
public:
    double x = 0.0;
    double y = 0.0;
};
Q_DECLARE_METATYPE(Coordinate)
```

## QML và Qt Quick

### Thiết kế ranh giới C++/QML

```cpp
// ✅ Đúng: đưa model C++ ra QML qua context property (Qt 5) hoặc QML_SINGLETON (Qt 6)

// Qt 6: QML_ELEMENT + QML_SINGLETON
class AppSettings : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QString theme READ theme WRITE setTheme NOTIFY themeChanged)
public:
    QString theme() const { return m_theme; }
    void setTheme(const QString& t) {
        if (m_theme != t) {
            m_theme = t;
            emit themeChanged();
        }
    }
signals:
    void themeChanged();
private:
    QString m_theme;
};
```

### Hiệu năng QML

```qml
// ❌ Sai: JavaScript trong onCompleted chặn main thread
Component.onCompleted: {
    for (var i = 0; i < 10000; i++) {
        model.append({"value": i});  // chậm, chặn render
    }
}

// ✅ Đúng: dùng model C++, hoặc WorkerScript cho JS nặng
// Ưu tiên QAbstractListModel C++ cho tập dữ liệu lớn
```

```qml
// ❌ Sai: binding phức tạp bị tính lại thường xuyên
Rectangle {
    width: parent.width * 0.8 + someComplexCalc()
    height: parent.height * 0.6 + anotherCalc()
}

// ✅ Đúng: giảm độ phức tạp của binding
Rectangle {
    width: parent.width * 0.8
    height: parent.height * 0.6
}
```

### Vòng đời object QML

- Đối tượng tạo trong QML do QML engine sở hữu.
- `Qt.createComponent()` + `createObject()`: bên gọi quản lý vòng đời.
- Dùng `Loader` để lazy init component nặng.
- `property var myObj: QtObject {}`: QML engine sở hữu.

```qml
// ✅ Đúng: Loader cho UI nặng có điều kiện
Loader {
    id: detailLoader
    active: selectedItem !== null
    sourceComponent: active ? detailComponent : null
}
```

## Chuyển từ Qt5 sang Qt6

### Thay đổi không tương thích chính

| Qt 5 | Qt 6 | Ghi chú |
|------|------|-------|
| `QList` khác `QVector` | `QList` = `QVector` | Hợp nhất, QList nay là QVector bên trong |
| `QStringRef` | `QStringView` | QStringView không sở hữu, giống string_view |
| `QLatin1String` | `QLatin1StringView` | Hoặc dùng literal `u"..."_s` |
| `QTextStream(stream)` | `QTextStream(&string)` | Constructor thay đổi |
| `QMouseEvent::pos()` | `QMouseEvent::position()` | Trả về QPointF thay vì QPoint |
| `QWheelEvent::delta()` | `QWheelEvent::angleDelta()` | Đã deprecated từ Qt 5 |
| `QComboBox::activated(int)` | `QComboBox::textActivated(QString)` | Phân biệt overload |

### CMake thay qmake

```cmake
# ✅ CMakeLists.txt cho Qt 6
cmake_minimum_required(VERSION 3.16)
project(MyApp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Quick Core)

qt_add_executable(MyApp
    main.cpp
    MainWindow.cpp
    MainWindow.h
    resources.qrc
)

target_link_libraries(MyApp PRIVATE
    Qt6::Widgets
    Qt6::Quick
    Qt6::Core
)
```

### API mới và cải tiến của Qt6

```cpp
// ✅ Qt 6: QStringView thay QStringRef
void process(QStringView sv);  // không sở hữu, hiệu quả

// ✅ Qt 6: API QCalendar để xử lý ngày
QCalendar cal(QCalendar::System::Gregorian);
QDate date = cal.dateFromParts(2024, 3, 15);

// ✅ Qt 6: cải tiến Qt Concurrent
auto future = QtConcurrent::run(QThreadPool::globalInstance(),
                                 []() { return heavyWork(); });

// ✅ Qt 6: API so sánh cho container
QList<int> a = {1, 2, 3};
QList<int> b = {1, 2, 3};
bool eq = a == b;  // chạy đúng trong Qt 6
```

### Checklist chuyển đổi

- [ ] Thay `qmake` bằng `CMake` (hoặc dùng `qt-cmake`)
- [ ] Thay `QStringRef` bằng `QStringView`
- [ ] Thay accessor event đã deprecated (`pos()` -> `position()`)
- [ ] Cập nhật kết nối signal/slot cho signal overload (dùng `qOverload`)
- [ ] Kiểm tra khả năng thay thế lẫn nhau giữa `QList`/`QVector`
- [ ] Test với module tương thích Qt 6: `find_package(Qt6 COMPONENTS Core5Compat)`

## Test

### Framework QTest

```cpp
#include <QtTest>
#include "parser.h"

class TestParser : public QObject {
    Q_OBJECT
private slots:
    void testEmptyInput() {
        Parser p("");
        QVERIFY(p.nextToken().isNull());
    }

    void testIntegerToken() {
        Parser p("42");
        auto token = p.nextToken();
        QCOMPARE(token.type(), Token::Integer);
        QCOMPARE(token.value().toInt(), 42);
    }

    void testNegativeNumber() {
        Parser p("-7");
        auto token = p.nextToken();
        QCOMPARE(token.value().toInt(), -7);
    }

    // Test theo dữ liệu
    void testValidTokens_data() {
        QTest::addColumn<QString>("input");
        QTest::addColumn<int>("expectedType");

        QTest::newRow("integer") << "42" << static_cast<int>(Token::Integer);
        QTest::newRow("string") << "\"hello\"" << static_cast<int>(Token::String);
        QTest::newRow("operator") << "+" << static_cast<int>(Token::Operator);
    }

    void testValidTokens() {
        QFETCH(QString, input);
        QFETCH(int, expectedType);

        Parser p(input);
        auto token = p.nextToken();
        QCOMPARE(token.type(), static_cast<Token::Type>(expectedType));
    }
};

QTEST_MAIN(TestParser)
#include "test_parser.moc"
```

### Test GUI bằng QTest

```cpp
class TestLoginDialog : public QObject {
    Q_OBJECT
private slots:
    void testLoginButtonDisabledWhenEmpty() {
        LoginDialog dialog;
        dialog.show();
        QVERIFY(QTest::qWaitForWindowExposed(&dialog));

        // Ban đầu nút login phải bị tắt
        QPushButton* loginBtn = dialog.findChild<QPushButton*>("loginButton");
        QVERIFY(loginBtn != nullptr);
        QVERIFY(!loginBtn->isEnabled());
    }

    void testLoginEnabledAfterInput() {
        LoginDialog dialog;
        dialog.show();
        QVERIFY(QTest::qWaitForWindowExposed(&dialog));

        QLineEdit* userField = dialog.findChild<QLineEdit*>("usernameField");
        QLineEdit* passField = dialog.findChild<QLineEdit*>("passwordField");

        QTest::keyClicks(userField, "alice");
        QTest::keyClicks(passField, "secret123");

        QPushButton* loginBtn = dialog.findChild<QPushButton*>("loginButton");
        QVERIFY(loginBtn->isEnabled());
    }

    void testSubmitOnEnter() {
        LoginDialog dialog;
        dialog.show();
        QVERIFY(QTest::qWaitForWindowExposed(&dialog));

        QLineEdit* userField = dialog.findChild<QLineEdit*>("usernameField");
        QTest::keyClicks(userField, "alice");
        QTest::keyClick(userField, Qt::Key_Return);

        // Kiểm tra dialog đã phát signal accepted
        QTRY_COMPARE(dialog.result(), static_cast<int>(QDialog::Accepted));
    }
};
```

### Mock object Qt cho unit test

```cpp
// ✅ Đúng: inject phụ thuộc để test được
class NetworkService {
public:
    virtual ~NetworkService() = default;
    virtual QJsonObject fetchUser(int id) = 0;
};

class MockNetworkService : public NetworkService {
public:
    QJsonObject fetchUser(int id) override {
        return m_responses.value(id, {});
    }
    void setResponse(int id, const QJsonObject& json) {
        m_responses[id] = json;
    }
private:
    QHash<int, QJsonObject> m_responses;
};

// Trong test:
void testProfileDisplay() {
    MockNetworkService mock;
    mock.setResponse(1, {{"name", "Alice"}, {"role", "admin"}});

    ProfileController controller(&mock);
    controller.loadProfile(1);
    QCOMPARE(controller.name(), "Alice");
    QCOMPARE(controller.role(), "admin");
}
```

### Tích hợp CI

```bash
# Chạy test Qt 6
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build .
ctest --output-on-failure

# Dùng Xvfb cho test GUI trên CI không có màn hình
xvfb-run -a ctest --output-on-failure
```

## Checklist

### Bộ nhớ

- [ ] Quan hệ cha-con đúng chưa? Có tránh con trỏ treo (dùng `QPointer`) không?
- [ ] Không sở hữu kép (cha + smart pointer)
- [ ] Dùng `deleteLater()` thay `delete` trong slot

### Signal và slot

- [ ] Dùng cú pháp con trỏ hàm (kiểm tra lúc biên dịch)
- [ ] Kết nối lambda có context object để tự ngắt kết nối
- [ ] Không có vòng lặp signal (chặn bằng so sánh bằng hoặc blockSignals)
- [ ] Ngắt kết nối đúng khi đổi nguồn signal

### Thread

- [ ] UI chỉ được truy cập từ main thread?
- [ ] Việc lâu có được đẩy ra ngoài (worker QThread, QtConcurrent)?
- [ ] Ưu tiên mẫu worker object hơn kế thừa QThread
- [ ] Dọn dẹp đúng: thread quit + wait trước khi xóa

### Chuỗi và container

- [ ] Dùng `QStringLiteral` hoặc `u"..."_s` cho chuỗi lúc biên dịch
- [ ] Dùng `const &` khi truy cập container chỉ đọc
- [ ] Không detach ngầm trong vòng lặp (dùng const iterator hoặc range-for với const ref)

### Model/View

- [ ] Signal begin/end Insert/Remove/Reset được phát đúng
- [ ] Phát dataChanged khi cập nhật từng item
- [ ] Dùng delegate cho render tùy biến (không kế thừa view)

### QML

- [ ] Ranh giới C++/QML dùng QML_ELEMENT (Qt 6) hoặc type đã đăng ký
- [ ] Không tính toán nặng trong JS của QML
- [ ] Dùng Loader cho component có điều kiện/lazy init

### Test

- [ ] Có unit test QTest cho logic lõi
- [ ] Test GUI dùng QTest::keyClicks / qWaitForWindowExposed
- [ ] Phụ thuộc được inject để mock được
- [ ] Test chạy trong CI (dùng Xvfb cho test GUI)

### Style

- [ ] Quy ước đặt tên (camelCase cho method, PascalCase cho class)
- [ ] Tài nguyên nạp từ `.qrc`
- [ ] Mọi class con QObject có macro `Q_OBJECT`
