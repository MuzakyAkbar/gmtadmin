<template>
  <Toast position="top-center"></Toast>
  <ConfirmDialog></ConfirmDialog>
  <component :is="layout">
    <router-view></router-view>
  </component>
</template>
<script>
import AuthLayout from './layouts/AuthLayout.vue'
import DefaultLayout from './layouts/DefaultLayout.vue'
import EmptyLayout from "./layouts/BlankLayout.vue";

export default {
  name: "App",
  components: {
    DefaultLayout,
    AuthLayout,
    EmptyLayout,
  },
  computed: {
    layout() {
      return this.$route.meta.layout || "DefaultLayout";
    },
  },
};
</script>
