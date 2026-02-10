<script setup>
import CRUDOrder from '../../components/CRUD/CRUDOrder.vue';

const columns = [
    {
        field: 'bookingdate',
        name: 'Booking Date',
        type: 'date',
        sortable:true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: false,
    },
    {
        field: 'skey',
        name: 'Booking ID',
        type: 'string',
        sortable: true,
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: false,
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
        readonly: false,
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
        readonly: false,
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
    <CRUDOrder entity="Order" objectname="bo_booking" child1name="bo_bookingline" title="Orders" :columns="columns" :candelete="false" :sortby="{col:'bookingdate',asc:{ascending:false}}"></CRUDOrder>
</template>
