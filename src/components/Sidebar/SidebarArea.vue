<script setup lang="ts">
import { useSidebarStore } from '@/stores/sidebar'
import { onClickOutside } from '@vueuse/core'
import { ref } from 'vue'
import SidebarItem from './SidebarItem.vue'
import Logo from '../Common/Logo.vue'

const target = ref(null)
const isCollapsed = ref(false)

const sidebarStore = useSidebarStore()

onClickOutside(target, () => {
  sidebarStore.isSidebarOpen = false
})

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const menuGroups = ref([
  {
    name: 'MENU',
    menuItems: [
      {
        icon: 'pi pi-th-large',
        label: 'Dashboard',
        route: '/',
      },
      // {
      //   icon: 'pi pi-clock',
      //   label: 'Booking Schedule',
      //   route: '/schedule',
      // },
      {
        icon: 'pi pi-envelope',
        label: 'Order',
        route: '/booking',
      },
      {
        icon: 'pi pi-id-card',
        label: 'Reservasi',
        route: '/reservation',
      },
      {
        icon: 'pi pi-dollar',
        label: 'Payment',
        route: '/payment',
      },
      {
        icon: 'pi pi-user',
        label: 'Customer',
        route: '/customer',
      },
      // {
      //   icon: 'pi pi-calendar',
      //   label: 'Event',
      //   route: '/event',
      // },
      {
        icon: 'pi pi-ticket',
        label: 'Venue',
        route: '/venue',
      },
      {
        icon: 'pi pi-ticket',
        label: 'Slot Booking',
        route: '/slot',
      },
      {
        icon: 'pi pi-tag',
        label: 'Price',
        route: '/price',
      },
      {
        icon: 'pi pi-percentage',
        label: 'Referral',
        route: '/referral',
      },
    ]
  },
  {
    name: 'MASTER',
    menuItems: [
      {
        icon: 'pi pi-wallet',
        label: 'Kategori Pendapatan',
        route: '/master/kategori-pendapatan',
      },
      {
        icon: 'pi pi-flag',
        label: 'Kategori Olahraga',
        route: '/master/kategori-olahraga',
      },
    ]
  }
])
</script>

<template>
  <aside
    class="absolute left-0 top-0 z-40 flex h-screen flex-col overflow-y-hidden bg-gmt1 duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 transition-all"
    :class="{
      'translate-x-0': sidebarStore.isSidebarOpen,
      '-translate-x-full': !sidebarStore.isSidebarOpen,
      'w-72.5': !isCollapsed,
      'w-20': isCollapsed
    }"
    ref="target"
  >
    <!-- SIDEBAR HEADER -->
    <div class="flex items-center justify-between gap-2 px-6 py-5.5 lg:py-6.5"
         :class="{ 'px-3': isCollapsed }">
      <router-link to="/" v-if="!isCollapsed" class="flex items-center">
        <Logo class="w-100" light="true" />
      </router-link>
      
      <router-link to="/" v-else class="flex items-center justify-center w-full">
        <Logo class="w-10 h-10" light="true" style="max-width: 40px; max-height: 40px;" />
      </router-link>

      <button class="block lg:hidden" @click="sidebarStore.isSidebarOpen = false">
        <svg
          class="fill-current"
          width="20"
          height="18"
          viewBox="0 0 20 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M19 8.175H2.98748L9.36248 1.6875C9.69998 1.35 9.69998 0.825 9.36248 0.4875C9.02498 0.15 8.49998 0.15 8.16248 0.4875L0.399976 8.3625C0.0624756 8.7 0.0624756 9.225 0.399976 9.5625L8.16248 17.4375C8.31248 17.5875 8.53748 17.7 8.76248 17.7C8.98748 17.7 9.17498 17.625 9.36248 17.475C9.69998 17.1375 9.69998 16.6125 9.36248 16.275L3.02498 9.8625H19C19.45 9.8625 19.825 9.4875 19.825 9.0375C19.825 8.55 19.45 8.175 19 8.175Z"
            fill=""
          />
        </svg>
      </button>
    </div>
    <!-- SIDEBAR HEADER -->

    <!-- Toggle Collapse Button (Desktop only) -->
    <button 
      @click="toggleCollapse"
      class="hidden lg:flex absolute -right-3.5 top-24 bg-white dark:bg-boxdark text-gmt1 dark:text-white rounded-full p-2 shadow-lg hover:shadow-xl border-2 border-gmt1 dark:border-white transition-all z-41 items-center justify-center"
      :title="isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
    >
      <svg 
        class="w-4 h-4 transition-transform duration-300"
        :class="{ 'rotate-180': isCollapsed }"
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        stroke-width="2.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <div class="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
      <!-- Sidebar Menu -->
      <nav class="px-4 py-4 mt-5 lg:mt-9 lg:px-6" :class="{ 'px-2': isCollapsed }">
        <template v-for="menuGroup in menuGroups" :key="menuGroup.name">
          <div>
            <h3 
              v-if="!isCollapsed"
              class="mb-4 ml-4 text-sm font-medium text-bodydark2"
            >
              {{ menuGroup.name }}
            </h3>

            <ul class="mb-6 flex flex-col gap-1.5">
              <SidebarItem
                v-for="(menuItem, index) in menuGroup.menuItems"
                :item="menuItem"
                :key="index"
                :index="index"
                :is-collapsed="isCollapsed"
              />
            </ul>
          </div>
        </template>
      </nav>
      <!-- Sidebar Menu -->

    </div>
  </aside>
</template>

<style scoped>
/* Smooth transition for width changes */
aside {
  transition: width 0.3s ease-in-out;
}

/* Ensure toggle button is always visible and clickable */
button[title*="Sidebar"] {
  z-index: 41;
}
</style>