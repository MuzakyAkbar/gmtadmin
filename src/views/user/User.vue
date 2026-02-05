<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'name',
        name: 'Full Name',
        type: 'string',
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'email',
        name: 'Email',
        type: 'string',
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'phone',
        name: 'Phone',
        type: 'string',
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'ktpnpwp',
        name: 'KTP / NPWP',
        type: 'string',
        sortable: true,
        required: true,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'address',
        name: 'Address',
        type: 'string',
        sortable: true,
        required: true,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'companyname',
        name: 'Organization',
        type: 'string',
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'companynpwp',
        name: 'Organization NPWP',
        type: 'string',
        sortable: true,
        required: true,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'isactive',
        name: 'Active',
        type: 'boolean',
        showintable: true,
        isdisplayed: true,
    },
]

</script>
<template>
    <CRUD entity="User" objectname="bo_user" title="Users" :columns="columns"></CRUD>
</template>
