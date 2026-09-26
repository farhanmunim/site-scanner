<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Admin login</title></svelte:head>

<div class="login">
  <h1>Owner login</h1>
  {#if !data.configured}
    <p class="alert amber">Set <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> (8+ characters) in the environment.</p>
  {/if}
  <form method="POST" class="stack-form">
    <div><label for="username">Username</label><input id="username" name="username" type="text" autocomplete="username" required /></div>
    <div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required /></div>
    {#if data.totp}<div><label for="code">Authenticator code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" /></div>{/if}
    <button class="primary" type="submit">Log in</button>
  </form>
  {#if form?.error}<p class="alert red" role="alert">{form.error}</p>{/if}
</div>
