<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  let { data, form } = $props();
</script>

<svelte:head><title>Admin login</title></svelte:head>

<div class="ad-login">
  <span class="eui-eyebrow">Admin</span>
  <h1>Owner login</h1>
  {#if !data.configured}
    <div class="ss-alert warn" style="margin: 0 0 var(--space-4)"><Icon name="alert" /><div>Set <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> (8+ characters) in the environment.</div></div>
  {/if}
  <form method="POST" class="f">
    <div><label class="eui-label" for="username">Username</label><input id="username" name="username" type="text" class="eui-input" autocomplete="username" required /></div>
    <div><label class="eui-label" for="password">Password</label><input id="password" name="password" type="password" class="eui-input" autocomplete="current-password" required /></div>
    {#if data.totp}<div><label class="eui-label" for="code">Authenticator code</label><input id="code" name="code" type="text" class="eui-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" /></div>{/if}
    <button class="eui-btn lg" type="submit">Log in</button>
  </form>
  {#if form?.error}<div class="ss-alert err" role="alert"><Icon name="alert" /><div>{form.error}</div></div>{/if}
</div>
