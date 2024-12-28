import { createApp } from "vue";
import { createPinia } from "pinia";
import "./assets/css/style.css";
import App from "./App.vue";
import router from "./router";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Lara from "@primevue/themes/lara";
import "primeicons/primeicons.css";

import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import Avatar from "primevue/avatar";
import AvatarGroup from "primevue/avatargroup"; //Optional for grouping

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Lara,
  },
});
app.use(ToastService);
app.use(ConfirmationService);

app.component("Toast", Toast);
app.component("ConfirmDialog", ConfirmDialog);
app.component("Button", Button);
app.component("InputText", InputText);
app.component("Menu", Menu);
app.component("Avatar", Avatar);
app.component("AvatarGroup", AvatarGroup);

app.mount("#app");
