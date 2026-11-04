# Vue 3

Dùng khi review code Vue 3 viết bằng Composition API: hệ thống reactivity, props và emits, watcher, composable, template, hiệu năng và tính năng mới của Vue 3.4, 3.5.

## Hệ thống reactivity

### Chọn `ref` hay `reactive`

```vue
<!-- ✅ Kiểu nguyên thủy dùng ref -->
<script setup lang="ts">
const count = ref(0)
const name = ref('Vue')

// ref truy cập qua .value
count.value++
</script>

<!-- ✅ Object, mảng dùng reactive (tùy chọn) -->
<script setup lang="ts">
const state = reactive({
  user: null,
  loading: false,
  error: null
})

// reactive truy cập trực tiếp
state.loading = true
</script>

<!-- 💡 Thực hành hiện đại: dùng ref cho tất cả để nhất quán -->
<script setup lang="ts">
const user = ref<User | null>(null)
const loading = ref(false)
const error = ref<Error | null>(null)
</script>
```

### Destructure object `reactive`

```vue
<!-- ❌ Destructure reactive làm mất reactivity -->
<script setup lang="ts">
const state = reactive({ count: 0, name: 'Vue' })
const { count, name } = state  // mất reactivity
</script>

<!-- ✅ Dùng toRefs để giữ reactivity -->
<script setup lang="ts">
const state = reactive({ count: 0, name: 'Vue' })
const { count, name } = toRefs(state)  // giữ reactivity
// hoặc dùng thẳng ref
const count = ref(0)
const name = ref('Vue')
</script>
```

### Side effect trong `computed`

```vue
<!-- ❌ computed sinh side effect -->
<script setup lang="ts">
const fullName = computed(() => {
  console.log('Computing...')  // side effect
  otherRef.value = 'changed'   // sửa state khác
  return `${firstName.value} ${lastName.value}`
})
</script>

<!-- ✅ computed chỉ dùng cho state dẫn xuất -->
<script setup lang="ts">
const fullName = computed(() => {
  return `${firstName.value} ${lastName.value}`
})
// side effect đặt trong watch hoặc event handler
watch(fullName, (name) => {
  console.log('Name changed:', name)
})
</script>
```

### Tối ưu bằng `shallowRef`

```vue
<!-- ❌ Object lớn dùng ref bị chuyển đổi sâu -->
<script setup lang="ts">
const largeData = ref(hugeNestedObject)  // reactive sâu, tốn hiệu năng
</script>

<!-- ✅ shallowRef tránh chuyển đổi sâu -->
<script setup lang="ts">
const largeData = shallowRef(hugeNestedObject)

// chỉ thay cả object mới kích hoạt cập nhật
function updateData(newData) {
  largeData.value = newData  // ✅ kích hoạt cập nhật
}

// ❌ sửa thuộc tính lồng không kích hoạt cập nhật
// largeData.value.nested.prop = 'new'

// cần kích hoạt thủ công thì dùng triggerRef
import { triggerRef } from 'vue'
largeData.value.nested.prop = 'new'
triggerRef(largeData)
</script>
```

## Props và emits

### Sửa trực tiếp props

```vue
<!-- ❌ Sửa trực tiếp props -->
<script setup lang="ts">
const props = defineProps<{ user: User }>()
props.user.name = 'New Name'  // không bao giờ sửa props trực tiếp
</script>

<!-- ✅ Dùng emit báo component cha cập nhật -->
<script setup lang="ts">
const props = defineProps<{ user: User }>()
const emit = defineEmits<{
  update: [name: string]
}>()
const updateName = (name: string) => emit('update', name)
</script>
```

### Khai báo kiểu cho `defineProps`

```vue
<!-- ❌ defineProps thiếu kiểu -->
<script setup lang="ts">
const props = defineProps(['title', 'count'])  // không kiểm tra kiểu
</script>

<!-- ✅ Khai báo kiểu kèm withDefaults -->
<script setup lang="ts">
interface Props {
  title: string
  count?: number
  items?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  count: 0,
  items: () => []  // mặc định của object, mảng cần hàm factory
})
</script>
```

### An toàn kiểu cho `defineEmits`

```vue
<!-- ❌ defineEmits thiếu kiểu -->
<script setup lang="ts">
const emit = defineEmits(['update', 'delete'])  // không kiểm tra kiểu
emit('update', someValue)  // kiểu tham số không an toàn
</script>

<!-- ✅ Khai báo kiểu đầy đủ -->
<script setup lang="ts">
const emit = defineEmits<{
  update: [id: number, value: string]
  delete: [id: number]
  'custom-event': [payload: CustomPayload]
}>()

// kiểm tra kiểu đầy đủ
emit('update', 1, 'new value')  // ✅
emit('update', 'wrong')  // ❌ TypeScript báo lỗi
</script>
```

## Tính năng mới của Vue 3.5

### Reactive Props Destructure (3.5+)

```vue
<!-- Trước Vue 3.5: destructure làm mất reactivity -->
<script setup lang="ts">
const props = defineProps<{ count: number }>()
// phải dùng props.count hoặc toRefs
</script>

<!-- ✅ Vue 3.5+: destructure vẫn giữ reactivity -->
<script setup lang="ts">
const { count, name = 'default' } = defineProps<{
  count: number
  name?: string
}>()

// count và name tự giữ reactivity
// dùng thẳng trong template và watch
watch(() => count, (newCount) => {
  console.log('Count changed:', newCount)
})
</script>

<!-- ✅ Kèm giá trị mặc định -->
<script setup lang="ts">
const {
  title,
  count = 0,
  items = () => []  // hàm làm giá trị mặc định (object, mảng)
} = defineProps<{
  title: string
  count?: number
  items?: () => string[]
}>()
</script>
```

### `defineModel` (3.4+)

```vue
<!-- ❌ Implement v-model kiểu cũ: dài dòng -->
<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// cần computed để binding hai chiều
const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})
</script>

<!-- ✅ defineModel: implement v-model gọn -->
<script setup lang="ts">
// tự xử lý props và emit
const model = defineModel<string>()

// dùng thẳng
model.value = 'new value'  // tự emit
</script>
<template>
  <input v-model="model" />
</template>

<!-- ✅ v-model có tên -->
<script setup lang="ts">
// implement v-model:title
const title = defineModel<string>('title')

// kèm mặc định và tùy chọn
const count = defineModel<number>('count', {
  default: 0,
  required: false
})
</script>

<!-- ✅ Nhiều v-model -->
<script setup lang="ts">
const firstName = defineModel<string>('firstName')
const lastName = defineModel<string>('lastName')
</script>
<template>
  <!-- component cha dùng: <MyInput v-model:first-name="first" v-model:last-name="last" /> -->
</template>

<!-- ✅ Modifier của v-model -->
<script setup lang="ts">
const [model, modifiers] = defineModel<string>()

// kiểm tra modifier
if (modifiers.capitalize) {
  // xử lý modifier .capitalize
}
</script>
```

### `useTemplateRef` (3.5+)

```vue
<!-- Cách cũ: thuộc tính ref trùng tên biến -->
<script setup lang="ts">
const inputRef = ref<HTMLInputElement | null>(null)
</script>
<template>
  <input ref="inputRef" />
</template>

<!-- ✅ useTemplateRef: template ref rõ ràng hơn -->
<script setup lang="ts">
import { useTemplateRef } from 'vue'

const input = useTemplateRef<HTMLInputElement>('my-input')

onMounted(() => {
  input.value?.focus()
})
</script>
<template>
  <input ref="my-input" />
</template>

<!-- ✅ Ref động -->
<script setup lang="ts">
const refKey = ref('input-a')
const dynamicInput = useTemplateRef<HTMLInputElement>(refKey)
</script>
```

### `useId` (3.5+)

```vue
<!-- ❌ Tự sinh ID có thể trùng -->
<script setup lang="ts">
const id = `input-${Math.random()}`  // lệch giữa SSR và client
</script>

<!-- ✅ useId: ID duy nhất, an toàn với SSR -->
<script setup lang="ts">
import { useId } from 'vue'

const id = useId()  // ví dụ: 'v-0'
</script>
<template>
  <label :for="id">Name</label>
  <input :id="id" />
</template>

<!-- ✅ Dùng trong component form -->
<script setup lang="ts">
const inputId = useId()
const errorId = useId()
</script>
<template>
  <label :for="inputId">Email</label>
  <input
    :id="inputId"
    :aria-describedby="errorId"
  />
  <span :id="errorId" class="error">{{ error }}</span>
</template>
```

### `onWatcherCleanup` (3.5+)

```vue
<!-- Cách cũ: tham số thứ ba của watch -->
<script setup lang="ts">
watch(source, async (value, oldValue, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  // ...
})
</script>

<!-- ✅ onWatcherCleanup: dọn dẹp linh hoạt hơn -->
<script setup lang="ts">
import { onWatcherCleanup } from 'vue'

watch(source, async (value) => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())

  // gọi ở bất kỳ đâu, không bắt buộc ở đầu callback
  if (someCondition) {
    const anotherResource = createResource()
    onWatcherCleanup(() => anotherResource.dispose())
  }

  await fetchData(value, controller.signal)
})
</script>
```

### Deferred Teleport (3.5+)

```vue
<!-- ❌ Đích của Teleport phải có sẵn lúc mount -->
<template>
  <Teleport to="#modal-container">
    <!-- lỗi nếu chưa có #modal-container -->
  </Teleport>
</template>

<!-- ✅ Thuộc tính defer hoãn mount -->
<template>
  <Teleport to="#modal-container" defer>
    <!-- chờ phần tử đích xuất hiện rồi mới mount -->
    <Modal />
  </Teleport>
</template>
```

## Watcher

### `watch` và `watchEffect`

```vue
<script setup lang="ts">
// ✅ watch: chỉ rõ dependency, chạy lazy
watch(
  () => props.userId,
  async (userId) => {
    user.value = await fetchUser(userId)
  }
)

// ✅ watchEffect: tự thu thập dependency, chạy ngay
watchEffect(async () => {
  // tự theo dõi props.userId
  user.value = await fetchUser(props.userId)
})

// 💡 Cách chọn:
// - Cần giá trị cũ: dùng watch
// - Cần chạy lazy: dùng watch
// - Dependency phức tạp: dùng watchEffect
</script>
```

### Hàm cleanup của `watch`

```vue
<!-- ❌ watch thiếu cleanup, có thể rò rỉ bộ nhớ -->
<script setup lang="ts">
watch(searchQuery, async (query) => {
  const controller = new AbortController()
  const data = await fetch(`/api/search?q=${query}`, {
    signal: controller.signal
  })
  results.value = await data.json()
  // query đổi nhanh thì request cũ không bị hủy
})
</script>

<!-- ✅ Dọn side effect bằng onCleanup -->
<script setup lang="ts">
watch(searchQuery, async (query, _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())  // hủy request cũ

  try {
    const data = await fetch(`/api/search?q=${query}`, {
      signal: controller.signal
    })
    results.value = await data.json()
  } catch (e) {
    if (e.name !== 'AbortError') throw e
  }
})
</script>
```

### Tùy chọn của `watch`

```vue
<script setup lang="ts">
// ✅ immediate: chạy ngay một lần
watch(
  userId,
  async (id) => {
    user.value = await fetchUser(id)
  },
  { immediate: true }
)

// ✅ deep: theo dõi sâu (tốn hiệu năng, dùng thận trọng)
watch(
  state,
  (newState) => {
    console.log('State changed deeply')
  },
  { deep: true }
)

// ✅ flush: 'post': chạy sau khi DOM cập nhật
watch(
  source,
  () => {
    // truy cập DOM đã cập nhật an toàn
    // không cần nextTick nữa
  },
  { flush: 'post' }
)

// ✅ once: true (Vue 3.4+): chỉ chạy một lần
watch(
  source,
  (value) => {
    console.log('Chỉ chạy một lần:', value)
  },
  { once: true }
)
</script>
```

### Theo dõi nhiều nguồn

```vue
<script setup lang="ts">
// ✅ Theo dõi nhiều ref
watch(
  [firstName, lastName],
  ([newFirst, newLast], [oldFirst, oldLast]) => {
    console.log(`Name changed from ${oldFirst} ${oldLast} to ${newFirst} ${newLast}`)
  }
)

// ✅ Theo dõi thuộc tính cụ thể của object reactive
watch(
  () => [state.count, state.name],
  ([count, name]) => {
    console.log(`count: ${count}, name: ${name}`)
  }
)
</script>
```

## Thực hành tốt với template

### `key` của `v-for`

```vue
<!-- ❌ Dùng index làm key trong v-for -->
<template>
  <li v-for="(item, index) in items" :key="index">
    {{ item.name }}
  </li>
</template>

<!-- ✅ Dùng định danh duy nhất làm key -->
<template>
  <li v-for="item in items" :key="item.id">
    {{ item.name }}
  </li>
</template>

<!-- ✅ Key ghép (khi không có ID duy nhất) -->
<template>
  <li v-for="(item, index) in items" :key="`${item.name}-${item.type}-${index}`">
    {{ item.name }}
  </li>
</template>
```

### Thứ tự ưu tiên `v-if` và `v-for`

```vue
<!-- ❌ Dùng v-if và v-for trên cùng phần tử -->
<template>
  <li v-for="user in users" v-if="user.active" :key="user.id">
    {{ user.name }}
  </li>
</template>

<!-- ✅ Lọc bằng computed -->
<script setup lang="ts">
const activeUsers = computed(() =>
  users.value.filter(user => user.active)
)
</script>
<template>
  <li v-for="user in activeUsers" :key="user.id">
    {{ user.name }}
  </li>
</template>

<!-- ✅ Hoặc bọc bằng template -->
<template>
  <template v-for="user in users" :key="user.id">
    <li v-if="user.active">
      {{ user.name }}
    </li>
  </template>
</template>
```

### Xử lý sự kiện

```vue
<!-- ❌ Logic phức tạp viết inline -->
<template>
  <button @click="items = items.filter(i => i.id !== item.id); count--">
    Delete
  </button>
</template>

<!-- ✅ Dùng method -->
<script setup lang="ts">
const deleteItem = (id: number) => {
  items.value = items.value.filter(i => i.id !== id)
  count.value--
}
</script>
<template>
  <button @click="deleteItem(item.id)">Delete</button>
</template>

<!-- ✅ Modifier sự kiện -->
<template>
  <!-- chặn hành vi mặc định -->
  <form @submit.prevent="handleSubmit">...</form>

  <!-- chặn nổi bọt -->
  <button @click.stop="handleClick">...</button>

  <!-- chỉ chạy một lần -->
  <button @click.once="handleOnce">...</button>

  <!-- modifier bàn phím -->
  <input @keyup.enter="submit" @keyup.esc="cancel" />
</template>
```

## Composable

### Nguyên tắc thiết kế composable

```typescript
// ✅ Composable thiết kế tốt
export function useCounter(initialValue = 0) {
  const count = ref(initialValue)

  const increment = () => count.value++
  const decrement = () => count.value--
  const reset = () => count.value = initialValue

  // trả về tham chiếu reactive và method
  return {
    count: readonly(count),  // readonly chặn bên ngoài sửa
    increment,
    decrement,
    reset
  }
}

// ❌ Không trả về .value
export function useBadCounter() {
  const count = ref(0)
  return {
    count: count.value  // ❌ mất reactivity
  }
}
```

### Truyền props vào composable

```vue
<!-- ❌ Truyền props vào composable làm mất reactivity -->
<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const { user } = useUser(props.userId)  // mất reactivity
</script>

<!-- ✅ Dùng toRef hoặc computed để giữ reactivity -->
<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const userIdRef = toRef(props, 'userId')
const { user } = useUser(userIdRef)  // giữ reactivity
// hoặc dùng computed
const { user } = useUser(computed(() => props.userId))

// ✅ Vue 3.5+: destructure rồi dùng thẳng
const { userId } = defineProps<{ userId: string }>()
const { user } = useUser(() => userId)  // hàm getter
</script>
```

### Composable bất đồng bộ

```typescript
// ✅ Mẫu composable bất đồng bộ
export function useFetch<T>(url: MaybeRefOrGetter<string>) {
  const data = ref<T | null>(null)
  const error = ref<Error | null>(null)
  const loading = ref(false)

  const execute = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(toValue(url))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      data.value = await response.json()
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  // URL reactive thì tự lấy lại
  watchEffect(() => {
    toValue(url)  // theo dõi dependency
    execute()
  })

  return {
    data: readonly(data),
    error: readonly(error),
    loading: readonly(loading),
    refetch: execute
  }
}

// Cách dùng
const { data, loading, error, refetch } = useFetch<User[]>('/api/users')
```

### Vòng đời và dọn dẹp

```typescript
// ✅ Xử lý vòng đời đúng trong composable
export function useEventListener(
  target: MaybeRefOrGetter<EventTarget>,
  event: string,
  handler: EventListener
) {
  // thêm sau khi component mount
  onMounted(() => {
    toValue(target).addEventListener(event, handler)
  })

  // gỡ khi component unmount
  onUnmounted(() => {
    toValue(target).removeEventListener(event, handler)
  })
}

// ✅ Quản lý side effect bằng effectScope
export function useFeature() {
  const scope = effectScope()

  scope.run(() => {
    // mọi effect reactive nằm trong scope này
    const state = ref(0)
    watch(state, () => { /* ... */ })
    watchEffect(() => { /* ... */ })
  })

  // dọn mọi effect
  onUnmounted(() => scope.stop())

  return { /* ... */ }
}
```

## Tối ưu hiệu năng

### `v-memo`

```vue
<!-- ✅ v-memo: cache cây con, tránh render lại -->
<template>
  <div v-for="item in list" :key="item.id" v-memo="[item.id === selected]">
    <!-- chỉ render lại khi item.id === selected đổi -->
    <ExpensiveComponent :item="item" :selected="item.id === selected" />
  </div>
</template>

<!-- ✅ Dùng cùng v-for -->
<template>
  <div
    v-for="item in list"
    :key="item.id"
    v-memo="[item.name, item.status]"
  >
    <!-- chỉ render lại khi name hoặc status đổi -->
  </div>
</template>
```

### `defineAsyncComponent`

```vue
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// ✅ Lazy load component
const HeavyChart = defineAsyncComponent(() =>
  import('./components/HeavyChart.vue')
)

// ✅ Kèm trạng thái loading và lỗi
const AsyncModal = defineAsyncComponent({
  loader: () => import('./components/Modal.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,  // hoãn hiện loading (tránh nhấp nháy)
  timeout: 3000  // thời gian timeout
})
</script>
```

### `KeepAlive`

```vue
<template>
  <!-- ✅ Cache component động -->
  <KeepAlive>
    <component :is="currentTab" />
  </KeepAlive>

  <!-- ✅ Chỉ định component được cache -->
  <KeepAlive include="TabA,TabB">
    <component :is="currentTab" />
  </KeepAlive>

  <!-- ✅ Giới hạn số component cache -->
  <KeepAlive :max="10">
    <component :is="currentTab" />
  </KeepAlive>
</template>

<script setup lang="ts">
// Hook vòng đời của component trong KeepAlive
onActivated(() => {
  // khi component được kích hoạt (lấy lại từ cache)
  refreshData()
})

onDeactivated(() => {
  // khi component bị tạm dừng (vào cache)
  pauseTimers()
})
</script>
```

### Virtual scroll

```vue
<!-- ✅ Danh sách lớn dùng virtual scroll -->
<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'

const { list, containerProps, wrapperProps } = useVirtualList(
  items,
  { itemHeight: 50 }
)
</script>
<template>
  <div v-bind="containerProps" style="height: 400px; overflow: auto">
    <div v-bind="wrapperProps">
      <div v-for="item in list" :key="item.data.id" style="height: 50px">
        {{ item.data.name }}
      </div>
    </div>
  </div>
</template>
```

## Checklist

### Hệ thống reactivity

- [ ] `ref` cho kiểu nguyên thủy, `reactive` cho object (hoặc thống nhất dùng `ref`).
- [ ] Không destructure object `reactive` (hoặc đã dùng `toRefs`).
- [ ] Props truyền vào composable vẫn giữ reactivity.
- [ ] Object lớn dùng `shallowRef`/`shallowReactive` để tối ưu.
- [ ] `computed` không có side effect.

### Props và emits

- [ ] `defineProps` khai báo kiểu bằng TypeScript.
- [ ] Mặc định phức tạp dùng `withDefaults` kèm hàm factory.
- [ ] `defineEmits` có kiểu đầy đủ.
- [ ] Không sửa trực tiếp props.
- [ ] Cân nhắc `defineModel` để gọn `v-model` (Vue 3.4+).

### Tính năng Vue 3.5 (nếu áp dụng)

- [ ] Dùng Reactive Props Destructure để truy cập props gọn hơn.
- [ ] Dùng `useTemplateRef` thay thuộc tính `ref`.
- [ ] Form dùng `useId` sinh ID an toàn với SSR.
- [ ] Dùng `onWatcherCleanup` cho logic dọn dẹp phức tạp.

### Watcher

- [ ] `watch`/`watchEffect` có hàm cleanup phù hợp.
- [ ] `watch` bất đồng bộ đã xử lý race condition.
- [ ] Watcher thao tác DOM dùng `flush: 'post'`.
- [ ] Không lạm dụng watcher (ưu tiên `computed`).
- [ ] Cân nhắc `once: true` cho theo dõi một lần.

### Template

- [ ] `v-for` dùng key duy nhất và ổn định.
- [ ] `v-if` và `v-for` không nằm trên cùng phần tử.
- [ ] Xử lý sự kiện bằng method, không viết logic phức tạp inline.
- [ ] Danh sách lớn dùng virtual scroll.

### Composable

- [ ] Logic liên quan tách thành composable.
- [ ] Composable trả về tham chiếu reactive (không phải `.value`).
- [ ] Không bọc hàm thuần thành composable.
- [ ] Side effect được dọn khi component unmount.
- [ ] Side effect phức tạp quản lý bằng `effectScope`.

### Hiệu năng

- [ ] Component lớn tách thành component nhỏ.
- [ ] Lazy load bằng `defineAsyncComponent`.
- [ ] Tránh chuyển đổi reactive không cần thiết.
- [ ] `v-memo` cho danh sách render tốn kém.
- [ ] `KeepAlive` để cache component động.
