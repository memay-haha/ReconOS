# Angular

Dùng khi review code Angular 17 trở lên: Signals, Standalone component, anti-pattern RxJS, change detection không dùng Zone (Zoneless), template, hiệu năng, test, route guard, dependency injection, HttpInterceptor.

## Signals và change detection

### Signal kết hợp OnPush tự kích hoạt change detection

```typescript
// ❌ State khả biến + OnPush = UI không cập nhật
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ data.name }}</p>`,
})
export class UserProfile {
  data = { name: 'Alice' };
  changeName() { this.data.name = 'Bob'; } // UI không cập nhật
}

// ✅ Signal + OnPush = change detection tự động
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ name() }}</p>`,
})
export class UserProfile {
  name = signal('Alice');
  changeName() { this.name.set('Bob'); } // tự kích hoạt CD
}
```

### OnPush không phát hiện khi object `@Input()` bị sửa tại chỗ

```typescript
// ❌ Sửa tại chỗ object Input: tham chiếu không đổi, OnPush không phát hiện
@Input() config!: Config;
updateConfig() { this.config.theme = 'dark'; }

// ✅ Tạo tham chiếu mới
updateConfig() { this.config = { ...this.config, theme: 'dark' }; }
```

### Dùng `computed()` cho state dẫn xuất

```typescript
// ❌ Dùng effect để đồng bộ state: anti-pattern, có thể gây thêm chu kỳ CD
export class CartComponent {
  total = signal(0);
  discounted = signal(0);

  constructor() {
    effect(() => this.discounted.set(this.total() * 0.9));
  }
}

// ✅ computed cho state dẫn xuất: tính lazy, không side effect
export class CartComponent {
  total = signal(0);
  discounted = computed(() => this.total() * 0.9);
}
```

### Signal đọc sau `await` trong `effect()` không được theo dõi

```typescript
// ❌ Đọc Signal sau await: phụ thuộc không được theo dõi
effect(async () => {
  const data = await fetchUserData();
  console.log(`Theme: ${theme()}`); // theme() không được theo dõi
});

// ✅ Đọc đồng bộ trước await
effect(async () => {
  const currentTheme = theme(); // đọc đồng bộ, được theo dõi
  const data = await fetchUserData();
  console.log(`Theme: ${currentTheme}`);
});
```

### Chỉ dùng effect cho tình huống cụ thể

```typescript
// ❌ Dùng effect để đồng bộ hai Signal: luôn dùng computed
effect(() => { this.filtered.set(this.items().filter(i => i.active)); });

// ✅ Tình huống hợp lý cho effect: thao tác DOM, ghi log phân tích, subscribe nguồn bên ngoài
effect(() => {
  const canvas = this.canvasRef.nativeElement;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = this.color();
  ctx.fillRect(0, 0, this.size(), this.size());
});

// 💡 "There are no situations where effect is good,
//    only situations where it is appropriate."
```

## Chuyển sang Standalone component

### Từ Angular 19, standalone là mặc định

```typescript
// ❌ Component NgModule kiểu cũ
@Component({
  selector: 'old-component',
  standalone: false,
})
export class OldComponent {}

// ✅ Standalone component hiện đại (Angular 19+ mặc định standalone)
@Component({
  selector: 'user-profile',
  imports: [ProfilePhoto, RouterLink],
  template: `<profile-photo /><a routerLink="/edit">Edit</a>`,
})
export class UserProfile {}
```

### Dấu hiệu cần chuyển khi review

```typescript
// ⚠️ Dấu hiệu cần chuyển:
// 1. standalone: false
// 2. declarations trong @NgModule
// 3. Component lấy phụ thuộc qua NgModule thay vì import trực tiếp

// ✅ Cách chuyển:
// 1. Xóa standalone: false
// 2. Thêm phụ thuộc vào mảng imports của component
// 3. Nếu NgModule không còn declarations, xóa NgModule
```

## Anti-pattern RxJS

### `subscribe()` phải đi kèm `takeUntilDestroyed`

```typescript
// ❌ subscribe trần: rò rỉ bộ nhớ, component hủy rồi vẫn nhận dữ liệu
@Component({ /* ... */ })
export class UserProfile implements OnInit {
  ngOnInit() {
    this.data$.subscribe(data => this.processData(data));
  }
}

// ✅ takeUntilDestroyed: tự unsubscribe khi component hủy (gọi trong constructor hoặc injection context)
@Component({ /* ... */ })
export class UserProfile {
  constructor() {
    this.data$.pipe(takeUntilDestroyed()).subscribe(data => {
      this.processData(data);
    });
  }
}

// ✅ Dùng ngoài constructor: truyền DestroyRef
@Component({ /* ... */ })
export class UserProfile {
  private destroyRef = inject(DestroyRef);

  startListening() {
    this.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(/* ... */);
  }
}
```

### Ưu tiên `toSignal` hơn `AsyncPipe`

```typescript
// ❌ AsyncPipe: phải import, template có | async
@Component({
  imports: [AsyncPipe],
  template: `{{ data$ | async }}`,
})

// ✅ toSignal: tự unsubscribe, dùng được ở mọi nơi
export class UserProfile {
  data = toSignal(this.data$, { initialValue: null });
  // template dùng thẳng data()
}
```

### Tránh gọi `toSignal` lặp lại

```typescript
// ❌ Mỗi lần gọi toSignal tạo một subscription mới
getData() {
  return toSignal(this.http.get('/api/data'));
}

// ✅ Lưu kết quả
data = toSignal(this.http.get('/api/data'), { initialValue: null });
```

## Change detection Zoneless

### Gán thuộc tính thường không được phát hiện (Angular 21+)

```typescript
// ❌ Trong Zoneless, gán thuộc tính thường không kích hoạt CD
export class UserService {
  user: User | null = null;
  loadUser() { this.user = fetchResult; } // không kích hoạt
}

// ✅ Signal tự kích hoạt CD
export class UserService {
  private _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  loadUser() { this._user.set(fetchResult); }
}
```

### API NgZone mất tác dụng trong Zoneless

```typescript
// ❌ NgZone.onStable không bao giờ phát trong Zoneless
ngZone.onStable.subscribe(() => { /* không bao giờ chạy */ });

// ✅ Dùng afterNextRender
afterNextRender({ write: () => { /* chạy sau CD */ } });
```

### Sửa Reactive Forms cần `markForCheck`

```typescript
// ❌ setValue/patchValue của Reactive Forms không tự lên lịch CD trong Zoneless
this.form.patchValue({ name: 'Alice' }); // UI có thể không cập nhật

// ✅ Đánh dấu thủ công hoặc phản ánh qua Signal
this.form.patchValue({ name: 'Alice' });
this.cdr.markForCheck();
```

### Tác nhân kích hoạt CD còn hiệu lực trong Zoneless

| Tác nhân | Mô tả |
|---|---|
| `signal.set()` / `.update()` | Cập nhật Signal tự kích hoạt |
| `ChangeDetectorRef.markForCheck()` | Đánh dấu thủ công |
| `ComponentRef.setInput()` | Gán input |
| Callback event listener trong template | Tương tác người dùng |

## Template

### Đưa logic phức tạp ra `computed` Signal

```typescript
// ❌ Biểu thức phức tạp trong template
template: `<div *ngIf="items.filter(i => i.active).length > 0 && user.role === 'admin'">`

// ✅ Tách thành computed
filteredItems = computed(() => this.items().filter(i => i.active));
shouldShow = computed(() => this.filteredItems().length > 0 && this.user().role === 'admin');
template: `@if (shouldShow()) { <div>...</div> }`
```

### Ưu tiên binding gốc hơn NgClass / NgStyle

```typescript
// ❌ NgClass/NgStyle: tốn thêm chi phí directive
template: `<div [ngClass]="{active: isActive}" [ngStyle]="{'color': textColor}">`

// ✅ Binding class/style gốc: hiệu năng tốt hơn
template: `<div [class.active]="isActive" [style.color]="textColor">`
```

### Thành viên chỉ dùng trong template đánh dấu `protected`

```typescript
// ❌ Method chỉ dùng trong template để public
export class UserProfile {
  formatName(name: string) { return name.trim(); }
}

// ✅ Thành viên chỉ dùng trong template đặt protected
export class UserProfile {
  protected formatName(name: string) { return name.trim(); }
}
```

### Thuộc tính do Angular quản lý đánh dấu `readonly`

```typescript
// ❌ input/output/model có thể bị gán đè ngoài ý muốn
userId = input<string>();
userSaved = output<void>();

// ✅ readonly chặn gán nhầm
readonly userId = input<string>();
readonly userSaved = output<void>();
readonly userName = model<string>();
```

### Đặt tên theo hành động, không theo sự kiện

```typescript
// ❌ Đặt tên theo sự kiện
template: `<button (click)="handleClick()">Save</button>`

// ✅ Đặt tên theo hành động
template: `<button (click)="saveUserData()">Save</button>`
```

## Hiệu năng

### effect là lựa chọn cuối, ưu tiên computed

```typescript
// ❌ effect dùng để đồng bộ state: thêm chu kỳ CD, có thể lặp vô hạn
effect(() => {
  this.filteredItems.set(this.items().filter(i => i.active));
});

// ✅ computed: tính lazy, không side effect, không thêm CD
filteredItems = computed(() => this.items().filter(i => i.active));
```

### `afterRenderEffect` tách pha đọc và ghi

```typescript
// ❌ Không chỉ định pha = mixedReadWrite = thêm DOM reflow
afterRenderEffect(() => {
  const height = el.offsetHeight; // đọc
  el.style.height = height + 10 + 'px'; // ghi
});

// ✅ Tách pha để giảm reflow
afterRenderEffect({
  earlyRead: () => el.offsetHeight,
  write: (height) => { el.style.height = height() + 10 + 'px'; },
  read: () => verifyLayout(),
});
```

### Ưu tiên `inject()` hơn inject qua constructor

```typescript
// ❌ Inject qua constructor: khó đọc khi nhiều phụ thuộc
export class UserService {
  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService,
  ) {}
}

// ✅ inject(): suy luận kiểu và dễ đọc hơn
export class UserService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
}
```

## Test

### Test component bằng TestBed

```typescript
// ✅ Test standalone component
@Component({
  standalone: true,
  template: `<button (click)="increment()">{{ count() }}</button>`,
})
export class CounterComponent {
  count = signal(0);
  increment() { this.count.update(c => c + 1); }
}

describe('CounterComponent', () => {
  let fixture: ComponentFixture<CounterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CounterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CounterComponent);
    fixture.detectChanges();
  });

  it('should increment on click', () => {
    const button = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();
    expect(button.textContent.trim()).toBe('1');
  });
});
```

### Test service với mock qua dependency injection

```typescript
// ✅ Dùng TestBed.inject + provide để thay thế
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  getUser(id: number) {
    return this.http.get<User>(`/api/users/${id}`);
  }
}

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should fetch user', () => {
    const mockUser = { id: 1, name: 'Alice' };
    service.getUser(1).subscribe(user => {
      expect(user).toEqual(mockUser);
    });
    const req = httpMock.expectOne('/api/users/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockUser);
  });
});
```

### Chiến lược test tích hợp

```typescript
// ❌ Mock quá mức: test mock chứ không test hành vi thật
provideHttpClient: () => ({
  get: jasmine.createSpy().and.returnValue(of(mockData)),
}),

// ✅ Dùng HttpTestingController để kiểm tra tương tác HTTP thật
TestBed.configureTestingModule({
  providers: [
    provideHttpClient(),
    provideHttpClientTesting(),
  ],
});

// ✅ Shallow render: chỉ test bản thân component, mock component con
describe('UserProfile', () => {
  it('should pass user to child', () => {
    const fixture = TestBed.createComponent(UserProfile);
    fixture.componentRef.setInput('user', testUser);
    fixture.detectChanges();

    const child = fixture.debugElement.query(By.directive(UserAvatar));
    expect(child.componentInstance.user()).toEqual(testUser);
  });
});
```

## Route guard

### AuthGuard / CanActivate

```typescript
// ✅ Route guard dạng hàm (khuyến nghị từ Angular 15+)
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

// Cách dùng
export const routes: Routes = [
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
];
```

### Guard cho route lazy load

```typescript
// ✅ Guard chỉ được resolve khi route tải
// auth.guard.ts
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated();
};

// routes.ts
export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./admin/routes').then(m => m.routes),
    canActivate: [authGuard],
  },
];
```

### Guard có tham số

```typescript
// ✅ Guard nhận tham số vai trò
export function roleGuard(allowedRoles: string[]): CanActivateFn {
  return (route, state) => {
    const auth = inject(AuthService);
    const user = auth.currentUser();
    return user ? allowedRoles.includes(user.role) : false;
  };
}

// Cách dùng
{
  path: 'admin',
  component: AdminComponent,
  canActivate: [roleGuard(['admin', 'superadmin'])],
}
```

### Guard CanDeactivate

```typescript
// ✅ Chặn rời trang khi còn thay đổi chưa lưu
export const unsavedChangesGuard: CanDeactivateFn<EditFormComponent> = (
  component
) => {
  if (component.hasUnsavedChanges()) {
    return confirm('You have unsaved changes. Leave anyway?');
  }
  return true;
};
```

## Mẫu dependency injection

### Dùng InjectionToken

```typescript
// ❌ Token dạng chuỗi: dễ trùng, không an toàn kiểu
providers: [{ provide: 'API_URL', useValue: 'https://api.example.com' }]

// ✅ InjectionToken an toàn kiểu
export const API_URL = new InjectionToken<string>('API_URL');

providers: [{ provide: API_URL, useValue: 'https://api.example.com' }]

// Cách dùng
private apiUrl = inject(API_URL);
```

### Provider nhiều cấp

```typescript
// ✅ Các cấp inject khác nhau
// Cấp root: singleton toàn cục
@Injectable({ providedIn: 'root' })
export class GlobalService {}

// Cấp component: mỗi instance component một bản riêng
@Component({
  providers: [LocalService],
})
export class MyComponent {
  private local = inject(LocalService);
}

// Cấp route: route và các route con dùng chung
{
  path: 'checkout',
  providers: [CheckoutService],
  children: [/* ... */],
}
```

### Factory provider

```typescript
// ✅ Cung cấp implementation khác nhau theo điều kiện
export const themeProvider: FactoryProvider = {
  provide: ThemeService,
  useFactory: () => {
    const platform = inject(PLATFORM_ID);
    if (isPlatformServer(platform)) {
      return new ServerThemeService();
    }
    return new BrowserThemeService();
  },
};

// ✅ Cấu hình theo môi trường
export const apiConfigProvider: FactoryProvider = {
  provide: ApiConfig,
  useFactory: () => {
    const env = inject(ENVIRONMENT);
    return env.production
      ? new ProductionApiConfig()
      : new DevelopmentApiConfig();
  },
};
```

## HttpInterceptor

### Interceptor gắn token xác thực

```typescript
// ✅ Interceptor dạng hàm: tự gắn token xác thực
export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const token = inject(AuthService).token();
  if (!token) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
}

// Đăng ký
provideHttpClient(withInterceptors([authInterceptor]))
```

### Interceptor xử lý lỗi

```typescript
// ✅ Interceptor dạng hàm: xử lý lỗi tập trung
export function errorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        router.navigate(['/login']);
      }
      if (error.status === 500) {
        console.error('Server error:', error);
      }
      return throwError(() => error);
    })
  );
}
```

### Chuyển đổi request và response

```typescript
// ✅ Interceptor dạng hàm: tự đổi camelCase ↔ snake_case
export function transformInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const transformedBody = req.body ? toSnakeCase(req.body) : null;
  const transformedReq = req.clone({ body: transformedBody });

  return next(transformedReq).pipe(
    map(event => {
      if (event instanceof HttpResponse) {
        return event.clone({ body: toCamelCase(event.body) });
      }
      return event;
    })
  );
}
```

### Thứ tự interceptor

```typescript
// ✅ Interceptor chạy theo thứ tự đăng ký
// Request: A → B → C → backend
// Response: backend → C → B → A
provideHttpClient(
  withInterceptors([
    authInterceptor,
    loggingInterceptor,
    errorInterceptor,
  ])
)
```

## Checklist

### Signals và change detection

- [ ] Dùng Signal + OnPush cho state của template, không dùng object khả biến
- [ ] Object `@Input()` cập nhật bằng tham chiếu mới, không sửa tại chỗ
- [ ] State dẫn xuất dùng `computed()`, không dùng `effect()`
- [ ] Signal trong `effect()` đọc trước `await`
- [ ] `effect()` chỉ dùng cho thao tác DOM, ghi log, subscribe nguồn bên ngoài

### Standalone component

- [ ] Không có `standalone: false` (Angular 19+)
- [ ] Component nhập phụ thuộc qua mảng `imports`
- [ ] Không có `@NgModule` thừa

### RxJS

- [ ] `.subscribe()` đi kèm `takeUntilDestroyed` hoặc `async` pipe
- [ ] Ưu tiên `toSignal` hơn `AsyncPipe`
- [ ] Không gọi `toSignal` lặp lại

### Zoneless

- [ ] State của template quản lý bằng Signal, không bằng thuộc tính thường
- [ ] Không dùng `NgZone.onStable` / `NgZone.onMicrotaskEmpty`
- [ ] Sau khi sửa Reactive Forms có gọi `markForCheck()`

### Template

- [ ] Logic phức tạp tách thành `computed` Signal
- [ ] Dùng `[class]`/`[style]` gốc thay vì `NgClass`/`NgStyle`
- [ ] Thành viên chỉ dùng trong template đánh dấu `protected`
- [ ] Thuộc tính `input`/`output`/`model` đánh dấu `readonly`
- [ ] Event handler đặt tên theo hành động (`saveData`, không phải `handleClick`)

### Hiệu năng

- [ ] `effect()` không dùng để đồng bộ state
- [ ] `afterRenderEffect` tách pha đọc và ghi
- [ ] Dùng `inject()` cho dependency injection
