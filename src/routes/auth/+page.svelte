<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    window.location.href = '/auth/sign-in';
  });
</script>

<svelte:head>
  <title>Auth - Central Web Desk</title>
</svelte:head>

<p>Redirecting...</p>
