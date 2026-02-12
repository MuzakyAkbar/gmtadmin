<script setup>
import { onMounted, ref } from 'vue';
import { DatePicker, useToast } from 'primevue';
import { useConfirm } from 'primevue';
import {useI18n} from 'vue-i18n';
import {formatCurrency} from '../../composables/formater'
import RestService from '../../services/rest';

const props = defineProps(['entity','objectname','title','columns','searchfield','details','sortby','candelete','canedit'])
const i18n = useI18n()
const toast = useToast();
const confirm = useConfirm()

const svc = new RestService(props.objectname);

const listview = ref(true)
const isloading = ref(true)
const isupdating = ref(false)
const data = ref()
const dt = ref()
const tabledata = ref()
const form = ref({})
const references = ref([])
const refvalue = ref([])

const onSave = ()=>{
    isloading.value = true
    if(isupdating.value){
        svc.update(form.value.id,form.value).then(async e=>{
            if(e.error){
                toast.add({severity:'error',summary:'Error',detail:e.error.message, life: 3000})
            }else{
                toast.add({severity:'success',summary:'Success',detail:e.statusText, life: 3000})
                await onRefresh()
                listview.value = true
                isupdating.value = false
                form.value = {}
            }
            isloading.value = false
        }).catch(err=>{
            console.log(err);
            toast.add({severity:'error',summary:'Error',detail:err})
            isloading.value = false
        })

    }else{
        svc.add(form.value).then(async e=>{
            if(e.error){
                toast.add({severity:'error',summary:'Error',detail:e.error.message, life: 3000})
            }else{
                toast.add({severity:'success',summary:'Success',detail:e.statusText, life: 3000})
                await onRefresh()
                listview.value = true
                form.value = {}
            }
            isloading.value = false
        }).catch(err=>{
            console.log(err);
            toast.add({severity:'error',summary:'Error',detail:err})
            isloading.value = false
        })
    }
}

const onDelete = (item)=>{
    confirm.require({
        message: i18n.t('Delete this item?'),
        header: i18n.t('Delete Confirmation'),
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Delete',
            severity: 'danger'
        },
        accept: ()=>{
            isloading.value = true
            svc.delete(item.id).then(async r=>{
                if(r.error){
                    toast.add({severity:'error',summary:'Error',detail:r.error.message, life: 3000})
                    isloading.value = false
                }else{
                    toast.add({severity:'success',summary:'Success',detail:r.statusText, life: 3000})
                    await onRefresh()
                    isloading.value = false
                }
            })
        }
    })
}

const onEdit = item => {
    form.value = item
    isupdating.value = true
    listview.value = false
}

const onRefresh = ()=>{
    isloading.value = true
    svc.list(0,25,props.sortby).then(e=>{
        data.value = e.data
        isloading.value = false
    }).catch(err=>{
        isloading.value = false
        toast.add({severity:'error',summary:'Error',detail:err})
    })
}

const exportCSV = () => {
    dt.value.exportCSV();
};

onMounted(()=>{
    tabledata.value = props.columns.filter(d=>{
        return d.showintable
    })

    props.columns.forEach(d=>{
        if(d.type=='options'){
            const refsvc = new RestService(d.source.model)
            refsvc.list().then(r=>{
                // console.log(r);
                if(r.data){
                    references.value[d.field] = r.data
                    let xv = {}
                    r.data.forEach(e=>{
                        xv = {...xv,[e.id]:e[d.source.labelfield]}
                    })
                    refvalue.value[d.field] = xv
                }
            })
        }
    })

    onRefresh()
})

</script>
<template>
    <div class="flex items-center justify-between p-2 mb-4 space-x-2">
        <h2 class="text-3xl font-bold">{{ props.title }}</h2>
        <div class="flex flex-wrap gap-2">
            <Button v-if="listview" @click="exportCSV" icon="pi pi-download" variant="text"></Button>
            <Button v-if="listview" @click="onRefresh" icon="pi pi-refresh" variant="text"></Button>
            <Button v-if="listview" @click="listview=false" severity="primary" icon="pi pi-plus" :label="$t('Add')"></Button>
            <Button v-if="!listview" @click="{listview=true;isupdating=false;form={}}" :disabled="isloading" severity="secondary" :label="$t('Cancel')" variant="outlined"></Button>
            <Button v-if="!listview" @click="onSave" :disabled="isloading" severity="success" :label="$t('Save')" class="ml-3"></Button>
        </div>
    </div>
    <div class="bg-white rounded ">
        <div v-if="listview">
            <Table :value="data" ref="dt" resizableColumns columnResizeMode="fit" sortMode="multiple" :loading="isloading">
                <template #header v-if="props.searchfield">
                    <div class="flex flex-wrap justify-between">
                        <IconField>
                            <InputIcon class="pi pi-search"/>
                            <InputText v-model="q" :placeholder="$t('Search')"/>
                        </IconField>
                    </div>
                </template>
                <template #empty>No {{ props.title }} found.</template>
                <template #loading>Loading {{ props.title }}. Please wait.</template>
                <Column v-for="col of tabledata" :key="col.field" :field="col.field" :header="col.name" :sortable="col.sortable">
                    <template v-if="col.type=='boolean'" #body="slotProps">
                        <i class="pi" :class="slotProps.data[col.field]?'pi-check text-green-500':'pi-times text-red-500'"></i>
                    </template>
                    <template v-if="col.type=='date'" #body="slotProps">
                        {{ new Date(slotProps.data[col.field]).toLocaleString('id-ID') }}
                    </template>
                    <template v-if="col.type=='datetime'" #body="slotProps">
                        {{ new Date(slotProps.data[col.field]).toLocaleString('id-ID') }}
                    </template>
                    <template v-if="col.type=='currency'" #body="slotProps">
                        <div class="text-right">{{ formatCurrency(slotProps.data[col.field]) }}</div>
                    </template>
                    <template v-if="col.type=='options'" #body="slotProps">
                        {{ refvalue[col.field]?refvalue[col.field][slotProps.data[col.field]]:'' }}
                    </template>
                </Column>
                <Column header="Action" :exportable="false" style="min-width: 1em;">
                    <template #body="slotProps">
                        <Button icon="pi pi-pencil" v-if="props.canedit===undefined||props.canedit==true" @click="onEdit(slotProps.data)" class="mr-2" variant="text"></Button>
                        <Button icon="pi pi-trash" v-if="props.candelete===undefined||props.candelete==true" @click="onDelete(slotProps.data)" severity="secondary" variant="text"></Button>
                    </template>
                </Column>
            </Table>
        </div>
        <div v-else>
            <div class="flex flex-col p-4">
                <div class="mb-3">
                    <span class="pb-3 text-xl font-bold">{{isupdating?$t('Edit'):$t('Create New')}} {{ props.entity }}</span>
                </div>
                <div class="flex flex-wrap my-2">
                    <template v-for="col of props.columns">
                        <div class="flex flex-col w-1/3 gap-2 pr-5 my-2">
                        <template v-if="col.type=='string'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputText :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                        </template>
                        <template v-if="col.type=='date'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <DatePicker :id="col.name" v-model="form[col.field]" :disabled="col.readonly" dateFormat="dd/mm/yy"/>
                        </template>
                        <template v-if="col.type=='currency'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputNumber :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                        </template>
                        <template v-if="col.type=='boolean'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <ToggleSwitch :id="col.name" v-model="form[col.field]"></ToggleSwitch>
                        </template>
                        <template v-if="col.type=='options'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <Dropdown :id="col.name" v-model="form[col.field]" :options="references[col.field]" :optionLabel="col.source.labelfield" optionValue="id" :disabled="col.readonly"></Dropdown>
                        </template>
                        <template v-if="col.type=='select'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <Dropdown :id="col.name" v-model="form[col.field]" :options="col.options" optionLabel="label" optionValue="value" :disabled="col.readonly"></Dropdown>
                        </template>
                        </div>
                </template>
                </div>
                <div class="mt-5"><span class="text-red">(*) Mandatory field</span></div>

                <div class="mt-5" v-if="props.details">
                    <Tabs value="0">
                        <TabList>
                            <Tab value="0">Header I</Tab>
                            <Tab value="1">Header II</Tab>
                            <Tab value="2">Header III</Tab>
                        </TabList>
                        <TabPanels>
                            <TabPanel value="0">
                                <p class="m-0">
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                                    consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                                </p>
                            </TabPanel>
                            <TabPanel value="1">
                                <p class="m-0">
                                    Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim
                                    ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Consectetur, adipisci velit, sed quia non numquam eius modi.
                                </p>
                            </TabPanel>
                            <TabPanel value="2">
                                <p class="m-0">
                                    At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa
                                    qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus.
                                </p>
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </div>
            </div>
        </div>
    </div>
</template>