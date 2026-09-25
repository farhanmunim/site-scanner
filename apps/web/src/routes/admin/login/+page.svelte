<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Admin login</title></svelte:head>

<div class="card" style="max-width: 420px; margin: 40px auto">
  <h1>Owner login</h1>
  {#if !data.configured}
    <p class="alert warn">Set <code>ADMIN_PASSWORD_HASH</code> (run <code>pnpm hash-password</code>) and <code>SESSION_SECRET</code> in the environment.</p>
  {/if}
  <form method="POST">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    {#if data.totp}
      <label for="code" style="margin-top: 10px; display: block">Authenticator code</label>
      <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" />
    {/if}
    <button class="primary" type="submit" style="margin-top: 14px">Log in</button>
  </form>
  {#if form?.error}<p class="alert bad" role="alert" style="margin-top: 10px">{form.error}</p>{/if}
</div>
