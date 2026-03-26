<script lang="ts">
  import { SignUp } from 'svelte-clerk';
</script>

<svelte:head>
  <title>Sign Up - Central Web Desk</title>
</svelte:head>

<div class="auth-container">
  <SignUp routing="path" path="/auth/sign-up" />
</div>

<style>
  .auth-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
</style>
