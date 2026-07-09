<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { initTenantStore } from './utils/tenant';

onLaunch(() => {
  initTenantStore();
});
</script>

<style lang="scss">
page {
  min-height: 100%;
  background: #f6f7f9;
  color: #1f2933;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
</style>
