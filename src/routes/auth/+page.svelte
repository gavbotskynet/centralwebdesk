<script lang="ts">
  import { SignIn } from 'svelte-clerk';

  export let data;
</script>

<svelte:head>
  <title>Sign In - Central Web Desk</title>
</svelte:head>

<div class="auth-container">
  <SignIn routing="path" path="/auth/sign-in" />
</div>

<style>
  .auth-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
</style>
