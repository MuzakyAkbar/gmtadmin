import { createApp } from "vue";
import { createPinia } from "pinia";
import { setupI18n } from "./i18n";

import "./assets/css/style.css";
import App from "./App.vue";
import router from "./router";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Lara from "@primevue/themes/lara";
import Nora from "@primevue/themes/lara";
import "primeicons/primeicons.css";
import OpenLayersMap from "vue3-openlayers";

import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Menu from "primevue/menu";
import Avatar from "primevue/avatar";
import AvatarGroup from "primevue/avatargroup"; //Optional for grouping
import Select from "primevue/select";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import ColumnGroup from "primevue/columngroup"; // optional
import Row from "primevue/row"; // optional
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import ToggleSwitch from "primevue/toggleswitch";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import DatePicker from "primevue/datepicker";

import { definePreset } from "@primevue/themes";

const app = createApp(App);
app.use(createPinia());
app.use(setupI18n());
app.use(router);
app.use(OpenLayersMap /*, options */);

const MyPreset = definePreset(Nora, {
  semantic: {
    primary: {
      50: "{blue.50}",
      100: "{blue.100}",
      200: "{blue.200}",
      300: "{blue.300}",
      400: "{blue.400}",
      500: "{blue.500}",
      600: "{blue.600}",
      700: "{blue.700}",
      800: "{blue.800}",
      900: "{blue.900}",
      950: "{blue.950}",
    },
    colorScheme: {
      dark: {
        surface: {
          0: "#ffffff",
          50: "{slate.50}",
          100: "{slate.100}",
          200: "{slate.200}",
          300: "{slate.300}",
          400: "{slate.400}",
          500: "{slate.500}",
          600: "{slate.600}",
          700: "{slate.700}",
          800: "{slate.800}",
          900: "{slate.900}",
          950: "{slate.950}",
        },
      },
    },
  },
});
app.use(PrimeVue, {
  theme: {
    preset: MyPreset,
    options: {
      darkModeSelector: ".dark",
    },
  },
});
app.use(ToastService);
app.use(ConfirmationService);

app.component("Toast", Toast);
app.component("ConfirmDialog", ConfirmDialog);
app.component("Button", Button);
app.component("InputText", InputText);
app.component("InputNumber", InputNumber);
app.component("Menu", Menu);
app.component("Avatar", Avatar);
app.component("AvatarGroup", AvatarGroup);
app.component("Dropdown", Select);
app.component("Table", DataTable);
app.component("Column", Column);
app.component("ColumnGroup", ColumnGroup);
app.component("Row", Row);
app.component("IconField", IconField);
app.component("InputIcon", InputIcon);
app.component("ToggleSwitch", ToggleSwitch);

app.component("Tabs", Tabs);
app.component("TabList", TabList);
app.component("Tab", Tab);
app.component("TabPanels", TabPanels);
app.component("TabPanel", TabPanel);
app.component("DatePicker", DatePicker);

app.mount("#app");
