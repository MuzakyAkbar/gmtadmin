<script setup>
import CRUDOrder from '../../components/CRUD/CRUDOrder.vue';

const columns = [
    {
        field: 'bookingdate',
        name: 'Booking Date',
        type: 'date',
        sortable: true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'skey',
        name: 'Booking ID',
        type: 'string',
        sortable: true,
        required: false,
        readonly: true,
        showintable: true,
        isdisplayed: false,
    },
    {
        field: 'bo_venue_id',
        name: 'Venue',
        type: 'options',
        source: {
            model: 'bo_venue',
            labelfield: 'name',
        },
        sortable: true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'bo_user_id',
        name: 'Customer',
        type: 'options',
        source: {
            model: 'bo_user',
            labelfield: 'name',
        },
        sortable: true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'grandtotal',
        name: 'Grand Total',
        type: 'currency',
        sortable: true,
        required: false,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'discount_amount',
        name: 'Discount',
        type: 'currency',
        sortable: true,
        required: false,
        readonly: true,
        showintable: false,
        isdisplayed: false,
    },
    {
        field: 'status',
        name: 'Status',
        type: 'options',
        source: {
            model: null,
            labelfield: 'label',
            staticOptions: [
                { id: 'CO', label: 'Confirmed (CO)' },
                { id: 'MT', label: 'Maintenance (MT)' },
                { id: 'CL', label: 'Cancelled (CL)' },
                { id: 'WP', label: 'Waiting Payment (WP)' },
            ],
            visibleOptions: ['CO', 'MT'],
        },
        sortable: true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: true, // CHANGED: dari false ke true
    },
    {
        field: 'created',
        name: 'Created At',
        type: 'date',
        sortable: true,
        required: false,
        showintable: true,
        isdisplayed: false,
        readonly: true,
    },
]

</script>
<template>
    <CRUDOrder 
        entity="Booking" 
        objectname="bo_booking" 
        child1name="bo_bookingline" 
        title="Bookings" 
        :columns="columns" 
        :canedit="true"
        :candelete="false" 
        :sortby="{col:'created', ascending:false}"
    >
    </CRUDOrder>
</template>

<style scoped>
/* Add any custom styles if needed */
</style>