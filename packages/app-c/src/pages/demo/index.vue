<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { listConsumerDemoResources } from '../../api/demo-resource';
import { useTenantStore } from '../../stores/tenant';
import { RequestError } from '../../utils/request';
import type { DemoResource } from '../../types/demo-resource';

// 租户上下文由 App.vue onLaunch（utils/tenant.ts）初始化；这里只读展示。
const tenantStore = useTenantStore();
const loading = ref(false);
const errorMessage = ref('');
const resources = ref<DemoResource[]>([]);

const emptyText = computed(() =>
  loading.value ? '加载中' : '当前租户暂无 demo resource'
);

async function loadResources() {
  loading.value = true;
  errorMessage.value = '';

  try {
    resources.value = await listConsumerDemoResources();
  } catch (error) {
    errorMessage.value =
      error instanceof RequestError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : '请求失败';
  } finally {
    loading.value = false;
  }
}

onLoad(() => {
  void loadResources();
});
</script>

<template>
  <view class="page">
    <view class="summary">
      <text class="title">{{ tenantStore.appName }}</text>
      <text class="tenant">Tenant: {{ tenantStore.tenantId }}</text>
    </view>

    <button class="refresh" :loading="loading" @click="loadResources">
      刷新 Demo Resource
    </button>

    <view v-if="errorMessage" class="error">{{ errorMessage }}</view>

    <view v-if="resources.length" class="list">
      <view v-for="item in resources" :key="item.id" class="row">
        <text class="name">{{ item.name }}</text>
        <text v-if="item.description" class="desc">{{ item.description }}</text>
        <text class="meta">tenant: {{ item.tenantId }}</text>
      </view>
    </view>

    <view v-else class="empty">{{ emptyText }}</view>
  </view>
</template>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx;
  box-sizing: border-box;
}

.summary,
.row {
  padding: 28rpx;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8rpx;
}

.title,
.name {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
}

.desc {
  display: block;
  margin-top: 8rpx;
  color: #334155;
  font-size: 28rpx;
}

.tenant,
.meta,
.empty,
.error {
  display: block;
  margin-top: 12rpx;
  color: #5f6b7a;
  font-size: 26rpx;
}

.refresh {
  margin: 28rpx 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.error {
  color: #b42318;
}
</style>
