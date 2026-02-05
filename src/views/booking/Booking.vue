<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'bookingdate',
        name: 'Booking Date',
        type: 'date',
        sortable:true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'skey',
        name: 'Booking ID',
        type: 'string',
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'bo_venue_id',
        name: 'Venue',
        type: 'options',
        source: {
            model:'bo_venue',
            labelfield:'name',
        },
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'grandtotal',
        name: 'Total',
        type: 'currency',
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'bo_user_id',
        name: 'User',
        type: 'options',
        source: {
            model:'bo_user',
            labelfield:'name',
        },
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'status',
        name: 'Status',
        type: 'string',
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'created',
        name: 'Created',
        type: 'date',
        sortable:true,
        required: true,
        showintable: true,
        isdisplayed: true,
        readonly: true,
    },
]

</script>
<template>
    <CRUD entity="Order" objectname="bo_booking" title="Orders" :columns="columns" :canedit="false" :candelete="false" :sortby="{col:'bookingdate',asc:{ascending:false}}"></CRUD>
</template>
