<template>
  <Toast/>
  <ConfirmDialog/>
  <component :is="layout">
    <router-view></router-view>
  </component>
</template>
<script>
import AuthLayout from './layouts/AuthLayout.vue'
import DefaultLayout from './layouts/DefaultLayout.vue'
import EmptyLayout from "./layouts/BlankLayout.vue";
import { ConfirmDialog } from 'primevue';

export default {
  name: "App",
  components: {
    DefaultLayout,
    AuthLayout,
    EmptyLayout,
  },
  computed: {
    layout() {
      // Determine which layout to use based on route metadata
      return this.$route.meta.layout || "DefaultLayout";
    },
  },
};
</script>
