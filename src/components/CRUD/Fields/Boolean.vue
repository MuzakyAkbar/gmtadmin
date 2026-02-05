<template>
    <label :for="props.col.name">{{ props.col.name }} <span v-if="props.col.required" class="text-red">*</span></label>
    <ToggleSwitch :id="props.col.name" v-model="props.form[col.field]"></ToggleSwitch>
</template>
<script>
const props = defineProps(['col','form'])
</script>
