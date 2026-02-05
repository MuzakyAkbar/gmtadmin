<template>
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
            <div v-if="msg" class="text-red-500">{{ msg }}</div>
            <Button label="Sign In" @click="onLogin" :disabled="isloading"/>
        </form>
    </div>
</template>
<script>
import AuthService from '../../services/auth'
import router from '../../router';
import { useUserStore } from '../../store/user';

export default {
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
            authsvc.login(this.email,this.password).then(async res=>{
                if(res.error){
                    this.msg = res.error.message
                    // this.$toast.add({severity:'error',summary:'Failed',detail:res.error.message,life:1000})
                }else{
                    authsvc.getSession().then(sess=>{
                        if(sess){
                            authsvc.getUserProfile(sess.session.user.id).then(cu=>{
                                if(cu.data){
                                    const userstore = useUserStore()
                                    userstore.setUser(cu.data)
                                    router.push({name:'Dashboard'})
                                }else{
                                    this.msg = res.error.message
                                }
                            })
                        }
                    })
                }
                this.isloading = false
            })
        }
    }
}
</script>
