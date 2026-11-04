# NestJS

Dùng khi review code NestJS: dependency injection và kiến trúc phân tầng, tổ chức module, Guard/Interceptor/Pipe, validate DTO, xử lý lỗi, phụ thuộc vòng, mẫu test.

## Dependency injection và kiến trúc phân tầng

### Ba tầng: Controller → Service → Repository

```typescript
// ❌ Inject ORM thẳng vào Controller, bỏ qua tầng Service
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.user.findMany();
  }
}

// ✅ Controller → Service → Repository
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  findAll() {
    return this.usersRepo.findAll();
  }
}
```

### Repository không inject lẫn nhau

```typescript
// ❌ Repository inject Repository khác: logic điều phối thuộc về Service
@Injectable()
export class OrdersRepository {
  constructor(private readonly usersRepository: UsersRepository) {}
}

// ✅ Điều phối nhiều Repository trong Service
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly usersRepo: UsersRepository,
  ) {}
}
```

### God Service: tách khi có hơn 8 phụ thuộc

```typescript
// ❌ Service khổng lồ với 9 phụ thuộc
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly usersRepo: UsersRepository,
    private readonly productsRepo: ProductsRepository,
    private readonly paymentsService: PaymentsService,
    private readonly mailerService: MailerService,
    private readonly inventoryService: InventoryService,
    private readonly discountService: DiscountService,
    private readonly taxService: TaxService,
    private readonly auditService: AuditService,
  ) {}
}

// ✅ Tách thành Use-Case Service (mỗi file một thao tác)
@Injectable()
export class CreateOrderService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly paymentsService: PaymentsService,
  ) {}

  async execute(dto: CreateOrderDto) { /* ... */ }
}
```

### Đảo ngược phụ thuộc bằng Symbol Token

```typescript
// ❌ Phụ thuộc trực tiếp vào implementation cụ thể: không thay được khi test
@Injectable()
export class UsersService {
  constructor(private readonly repo: TypeOrmUserRepository) {}
}

// ✅ Interface + Symbol Token: thay được bằng implementation trong bộ nhớ
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
}

// module:
{
  provide: USER_REPOSITORY,
  useClass: TypeOrmUserRepository,
}

// service:
@Injectable()
export class UsersService {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepository) {}
}
```

## Tổ chức module

### Cấu trúc bốn tầng khuyến nghị

```text
src/
  common/         ← hạ tầng kỹ thuật toàn cục (Guards, Filters, Interceptors, Decorators)
  core/           ← hạ tầng nội bộ (cấu hình Config, Database, Queue)
  integrations/   ← bọc dịch vụ bên ngoài (Mailer, Storage, Stripe, SMS)
  modules/        ← logic nghiệp vụ tổ chức theo miền
    [feature]/
      dtos/
      repositories/
      services/
        internal/     ← Service dùng chung trong module
        use-cases/    ← một file = một thao tác
      types/
      [feature].controller.ts
      [feature].module.ts
```

### Domain không phụ thuộc framework

```typescript
// ❌ Domain Entity phụ thuộc NestJS: không test độc lập được
import { Injectable } from '@nestjs/common';

@Injectable()
export class User {
  constructor(private readonly email: string) {}
}

// ✅ Domain là class thuần, không decorator framework
export class User {
  private constructor(private readonly email: string) {}

  static create(email: string): User {
    return new User(email);
  }
}
```

### Quy tắc chính

- `common/` **không chứa nghiệp vụ**. Nếu code cần biết "đơn hàng" là gì, code đó không thuộc `common/`.
- `integrations/` bọc từng dịch vụ bên ngoài. Đổi SendGrid sang AWS SES chỉ sửa một thư mục.
- Dùng **Use-Case Service** (mỗi file một thao tác) thay cho `XxxService` khổng lồ 15 method.

## Guard / Interceptor / Pipe

### Không đặt logic nghiệp vụ trong Guard

```typescript
// ❌ Guard truy vấn CSDL + phán quyết nghiệp vụ
@Injectable()
export class OrderOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const order = await this.prisma.order.findUnique({
      where: { id: req.params.id },
    });
    if (order.userId !== req.user.id) {
      return false; // lấy dữ liệu + quy tắc nghiệp vụ đều nằm trong Guard
    }
    return true;
  }
}

// ✅ Guard chỉ kiểm tra phân quyền (vai trò/quyền)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}
```

### Interceptor chỉ dùng cho cross-cutting concern

```typescript
// ❌ Interceptor chạy logic nghiệp vụ
@Injectable()
export class PricingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    // tính giảm giá: đây không phải cross-cutting concern!
    return next.handle().pipe(map(data => applyDiscount(data)));
  }
}

// ✅ Interceptor cho log, cache, chuyển đổi response, đo thời gian
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const now = Date.now();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(() => console.log(`${req.method} ${req.url} - ${Date.now() - now}ms`)),
    );
  }
}
```

### ValidationPipe toàn cục phải bật whitelist

```typescript
// ❌ Không whitelist: thuộc tính thừa trong body đi thẳng vào
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

// ✅ ValidationPipe toàn cục + whitelist lọc thuộc tính lạ
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(3000);
}
```

## Validation dữ liệu (DTO)

### `@ValidateNested()` phải đi kèm `@Type()`

```typescript
// ❌ Chỉ có @ValidateNested: object lồng bị bỏ qua validation mà không báo!
export class CreateOrderDto {
  @ValidateNested()
  shipping: AddressDto;
}

// ✅ Dùng cặp @ValidateNested + @Type
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  shipping: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

### Cấm Body kiểu `any` trần

```typescript
// ❌ Không DTO: không validate, không an toàn kiểu, không có tài liệu Swagger
@Post()
create(@Body() body: any) {
  return this.service.create(body);
}

// ✅ Mỗi thao tác một DTO
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

@Post()
create(@Body() dto: CreateUserDto) {
  return this.service.create(dto);
}
```

### Create và Update dùng DTO khác nhau

```typescript
// ❌ PATCH cũng bắt buộc mọi trường: thiết kế API không hợp lý
@Patch(':id')
update(@Body() dto: CreateUserDto) { /* mọi trường bắt buộc */ }

// ✅ Update dùng PartialType
export class UpdateUserDto extends PartialType(CreateUserDto) {}

@Patch(':id')
update(@Body() dto: UpdateUserDto) { /* mọi trường tùy chọn */ }
```

### Object lồng tùy chọn

```typescript
// ❌ Object lồng tùy chọn thiếu @IsOptional
export class UpdateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  shipping?: AddressDto; // vẫn cố validate khi undefined
}

// ✅ @IsOptional + @ValidateNested + @Type
export class UpdateOrderDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  shipping?: AddressDto;
}
```

## Xử lý lỗi

### Cấm nuốt lỗi

```typescript
// ❌ catch { return null }: che lỗi, bên gọi không phân biệt được "không tồn tại" với "gặp lỗi"
async findOne(id: string) {
  try {
    return await this.repo.findById(id);
  } catch (e) {
    return null;
  }
}

// ✅ Ném exception có ý nghĩa
async findOne(id: string): Promise<User> {
  const user = await this.repo.findById(id);
  if (!user) {
    throw new NotFoundException(`User ${id} not found`);
  }
  return user;
}
```

### Dùng exception có sẵn

```typescript
// ❌ Tự dựng HTTP response
throw new HttpException('Bad request', 400);

// ✅ Dùng exception có sẵn mang ngữ nghĩa
throw new BadRequestException('Invalid email format');
throw new NotFoundException('User not found');
throw new ConflictException('Email already taken');
throw new ForbiddenException('Insufficient permissions');
throw new UnauthorizedException('Invalid credentials');
```

### Exception filter tự viết

```typescript
// ✅ Exception filter toàn cục: thống nhất định dạng response
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(`${request.method} ${request.url} - ${status}`, exception instanceof Error ? exception.stack : '');

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

## Phụ thuộc vòng

### Module tham chiếu vòng

```typescript
// ❌ Module A ↔ Module B
@Module({ imports: [UsersModule] })
export class OrdersModule {}

@Module({ imports: [OrdersModule] })
export class UsersModule {}

// ✅ Tách logic dùng chung ra module thứ ba
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

@Module({ imports: [SharedModule] })
export class OrdersModule {}

@Module({ imports: [SharedModule] })
export class UsersModule {}
```

### `forwardRef` là lựa chọn cuối

```typescript
// ⚠️ forwardRef cho thấy thiết kế có vấn đề: ưu tiên thiết kế lại
@Module({
  imports: [forwardRef(() => UsersModule)],
})
export class OrdersModule {}

// ✅ Thiết kế lại để bỏ vòng:
// 1. Tách module dùng chung
// 2. Dùng hướng sự kiện (EventEmitter) thay cho gọi trực tiếp
// 3. Đưa logic dùng chung lên Service ở tầng trên
```

## Mẫu test

### Use-Case test được không cần NestJS

```typescript
// ✅ Không cần NestFactory: new trực tiếp
describe('CreateUserHandler', () => {
  let handler: CreateUserHandler;
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    handler = new CreateUserHandler(repo);
  });

  it('creates a user', async () => {
    const id = await handler.execute(
      new CreateUserCommand('user@example.com', 'Alice'),
    );
    expect(id).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    await handler.execute(new CreateUserCommand('user@example.com', 'Alice'));
    await expect(
      handler.execute(new CreateUserCommand('user@example.com', 'Bob')),
    ).rejects.toThrow('already exists');
  });
});
```

### Test E2E cấu hình Pipe giống production

```typescript
describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // phải giống cấu hình toàn cục trong main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/POST users - valid', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ email: 'test@test.com', name: 'Test' })
      .expect(201);
  });

  it('/POST users - extra fields rejected', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ email: 'test@test.com', name: 'Test', role: 'admin' })
      .expect(400);
  });
});
```

## Checklist

### Kiến trúc phân tầng

- [ ] ORM/Prisma không inject thẳng vào Controller
- [ ] Logic nghiệp vụ không nằm trong Controller
- [ ] Repository không inject lẫn nhau
- [ ] Service có tối đa 8 phụ thuộc (vượt thì tách thành Use-Case)

### Dependency injection

- [ ] Phụ thuộc cần thay thế được dùng interface + Symbol Token
- [ ] Không có `forwardRef()` (nếu có, cần tài liệu thiết kế nêu lý do)
- [ ] Service scoped không inject vào Singleton

### Validation dữ liệu

- [ ] Mỗi `@ValidateNested()` có `@Type()` tương ứng
- [ ] Đã cấu hình `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` toàn cục
- [ ] Không có `@Body() body: any`, bắt buộc dùng DTO
- [ ] Create và Update dùng DTO khác nhau (`PartialType`)
- [ ] Validate mảng dùng `{ each: true }`
- [ ] Object lồng tùy chọn dùng `@IsOptional()` + `@ValidateNested()` + `@Type()`

### Guard / Interceptor / Pipe

- [ ] Guard chỉ kiểm tra phân quyền, không truy vấn CSDL
- [ ] Interceptor chỉ dùng cho cross-cutting concern (log, cache, chuyển đổi response)
- [ ] Quy tắc nghiệp vụ nằm trong Service

### Xử lý lỗi

- [ ] Không có `catch { return null }`, ném exception có ý nghĩa
- [ ] Dùng exception có sẵn của NestJS
- [ ] Exception filter tự viết đặt trong `common/filters/`

### Module

- [ ] Không có module tham chiếu vòng
- [ ] Domain Entity không có decorator framework (`@Injectable`...)
- [ ] Lời gọi dịch vụ bên ngoài nằm trong `integrations/`

### Test

- [ ] Use-Case Service test được không cần NestJS
- [ ] Test E2E cấu hình Pipe/Guard toàn cục giống production
- [ ] Domain Entity không phụ thuộc framework
