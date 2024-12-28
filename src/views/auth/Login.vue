<template>


    <div v-if="false" class="w-full max-w-sm mx-auto overflow-hidden bg-white rounded-lg shadow-md dark:bg-gray-800">
        <div class="px-6 py-4">
            <div class="flex justify-center mx-auto">
                <Logo class="h-20 mx-7" />
            </div>

            <h3 class="mt-3 text-xl font-medium text-center text-gray-600 dark:text-gray-200">Welcome Back</h3>

            <p class="mt-1 text-center text-gray-500 dark:text-gray-400">Login</p>

            <form>
                <div class="w-full mt-4">
                    <InputText type="email" placeholder="Email address" class="w-full" v-model="email" />
                </div>

                <div class="w-full mt-4">
                    <InputText type="password" placeholder="Password" class="w-full" v-model="password" @keyup.enter="onLogin()" />
                </div>

                <div class="p-3 text-red-500">{{ msg }}</div>

                <div class="flex items-center justify-between mt-4">
                    <a href="#" class="text-sm text-gray-600 dark:text-gray-200 hover:text-gray-500">Forgot Password?</a>

                    <Button label="Sign In" @click="onLogin" :disabled="isloading"/>
                </div>
            </form>
        </div>

        <div class="flex items-center justify-center py-4 text-center bg-gray-50 dark:bg-gray-700">
            <span class="text-sm text-gray-600 dark:text-gray-200">Don't have an account? </span>

            <a href="#" class="mx-2 text-sm font-bold text-blue-500 dark:text-blue-400 hover:underline">Contact Us</a>
        </div>
    </div>

    <!-- Card -->
    <div class="w-full max-w-xl p-6 space-y-8 bg-white rounded-lg shadow sm:p-8 dark:bg-gray-800">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            Sign in to platform
        </h2>
        <form class="mt-8 space-y-6" action="#">
            <div>
                <label for="email" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your email</label>
                <InputText name="email" id="email" type="email" placeholder="Email address" class="w-full" v-model="email" />
            </div>
            <div>
                <label for="password" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your password</label>
                <InputText type="password" placeholder="Password" class="w-full" v-model="password" @keyup.enter="onLogin()" />
            </div>
            <div class="flex items-start">
                <a href="#" class="text-sm text-primary-700 hover:underline dark:text-primary-500">Lost Password?</a>
            </div>
            <div v-if="msg" class="text-red-500">{{ msg }}</div>
            <Button label="Sign In" @click="onLogin" :disabled="isloading"/>
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Not registered? <a class="text-primary-700 hover:underline dark:text-primary-500">Create account</a>
            </div>
        </form>
    </div>
</template>
<script>
import { InputText } from 'primevue';
import Logo from '../../components/common/Logo.vue'
import AuthService from '../../services/auth'
import router from '../../router';

export default {
    components: {
        Logo
    },
    data(){
        return {
            email: null,
            password: null,
            msg: null,
            isloading: false,
        }
    },
    methods: {
        onLogin(){
            this.isloading = true
            const authsvc = new AuthService()
            authsvc.login(this.email,this.password).then(res=>{
                if(res.error){
                    this.msg = res.error.message
                    // this.$toast.add({severity:'error',summary:'Failed',detail:res.error.message,life:1000})
                }else{
                    router.push({name:'Dashboard'})
                }
                this.isloading = false
            })
        }
    }
}
</script>
