<template>
  <select
    class="b3-select fn__flex-center fn__size200"
    :value="modelValue"
    @input="handleInput"
  >
    <option
      v-for="item of options"
      :key="item.value"
      :value="item.value"
    >
      {{ item.text }}
    </option>
  </select>
</template>

<script setup lang="ts">
defineProps<{
  options: Array<{
    value: string
    text: string
  }>
  modelValue: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function handleInput(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:modelValue', target?.value ?? '')
}
</script>
