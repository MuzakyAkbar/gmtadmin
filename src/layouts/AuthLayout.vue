<template>

  <main class="bg-gray-50 dark:bg-gray-900">
    <div class="flex flex-col items-center justify-center px-6 pt-8 mx-auto md:h-screen pt:mt-0 dark:bg-gray-900">
      <a href="#" class="flex items-center justify-center mb-8 text-2xl font-semibold lg:mb-10 dark:text-white">
        <Logo class="h-20"/>
      </a>

      <router-view />
    </div>

  </main>


</template>

<script setup>
import Logo from '../components/Common/Logo.vue';
</script>
