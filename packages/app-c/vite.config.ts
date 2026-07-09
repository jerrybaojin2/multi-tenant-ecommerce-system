import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// uni-app Vue3 + Vite 构建（MP-WEIXIN）。
// 插件接管 vite 入口：从 src/main.ts、pages.json、manifest.json 生成小程序产物。
// 见 .trellis/spec/frontend/{directory-structure,quality-guidelines}.md。
export default defineConfig({
  plugins: [uni()],
});
