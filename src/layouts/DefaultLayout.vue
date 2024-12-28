<template>

  <Header />

  <div class="flex pt-16 overflow-hidden bg-gray-50 dark:bg-gray-900">

    <Sidebar />

    <div id="main-content" class="relative w-full h-full overflow-y-auto bg-gray-50 lg:ml-64 dark:bg-gray-900">
      <main>
        <div class="px-4 pt-6">
          <router-view />
        </div>
      </main>


<p class="my-10 text-sm text-center text-gray-500">
  &copy; 2019-2023 <a href="https://sigapdriver.com/" class="hover:underline" target="_blank">sigapdriver.com</a>. All rights reserved.
</p>

</div>

</div>


<!-- ===== Page Wrapper Start ===== -->
<div v-if="false" class="flex h-screen overflow-hidden">
  <!-- ===== Sidebar Start ===== -->
  <Sidebar />
  <!-- ===== Sidebar End ===== -->

  <!-- ===== Content Area Start ===== -->
  <div class="relative flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
    <!-- ===== Header Start ===== -->
    <Header />
    <!-- ===== Header End ===== -->

    <!-- ===== Main Content Start ===== -->
    <main>
      <div class="p-4 mx-auto max-w-screen-2xl md:p-6 2xl:p-10">
        <router-view />
      </div>
    </main>
    <!-- ===== Main Content End ===== -->
  </div>
</div>
<!-- ===== Page Wrapper End ===== -->

</template>

<script>
import Sidebar from "../components/layout/Sidebar.vue";
import Header from "../components/layout/Header.vue";

export default {
  name: "DefaultLayout",
  components: {
    Sidebar,
    Header,
  },
};
</script>
