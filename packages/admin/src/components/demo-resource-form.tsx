'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { merchantDemoResourceApi } from '@/lib/demo-resource-api';
import type {
  CreateDemoResourceInput,
  DemoResource,
  UpdateDemoResourceInput,
} from '@/lib/types';
import styles from './demo-resource-form.module.css';

interface CreateProps {
  mode: 'create';
}
interface UpdateProps {
  mode: 'update';
  resource: Pick<DemoResource, 'id' | 'name' | 'description'>;
}
type FormProps = Readonly<CreateProps | UpdateProps>;

/**
 * Demo resource 新增/编辑表单（merchant 本租户写入）。
 * 走 merchantDemoResourceApi（X-Tenant-Id 注入）；backend guard 会用当前租户覆盖
 * 请求体里夹带的 tenantId，跨租户写入会被拒绝。
 */
export function DemoResourceForm(props: FormProps) {
  const router = useRouter();
  const { mode } = props;
  const initialName = mode === 'update' ? props.resource.name : '';
  const initialDescription = mode === 'update' ? props.resource.description : '';
  const resourceId = mode === 'update' ? props.resource.id : '';

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isUpdate = mode === 'update';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const trimmedDescription = description.trim();
      if (isUpdate) {
        const patch: UpdateDemoResourceInput = {};
        if (trimmedName !== initialName) patch.name = trimmedName;
        if (trimmedDescription !== initialDescription) {
          patch.description = trimmedDescription;
        }
        await merchantDemoResourceApi.update(resourceId, patch);
        router.push('/merchant/demo-resources');
        router.refresh();
      } else {
        const input: CreateDemoResourceInput = {
          name: trimmedName,
          description: trimmedDescription || undefined,
        };
        await merchantDemoResourceApi.create(input);
        setName('');
        setDescription('');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.field}>
        <span>名称</span>
        <input
          name="name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          maxLength={80}
          placeholder="demo resource 名称"
        />
      </label>
      <label className={styles.field}>
        <span>描述（可选）</span>
        <textarea
          name="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={240}
          rows={3}
          placeholder="可选描述，最长 240 字符"
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <button type="submit" disabled={submitting}>
          {submitting ? '提交中…' : isUpdate ? '保存' : '新增'}
        </button>
      </div>
    </form>
  );
}

/** 删除按钮（merchant 本租户）；跨租户或不存在时 backend 返回 404。 */
export function DeleteDemoResourceButton({
  id,
}: Readonly<{ id: string }>) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function onDelete() {
    if (typeof window !== 'undefined' && !window.confirm('确认删除该 demo resource？')) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await merchantDemoResourceApi.remove(id);
      router.push('/merchant/demo-resources');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.deleteWrap}>
      <button
        type="button"
        className={styles.danger}
        onClick={onDelete}
        disabled={deleting}
      >
        {deleting ? '删除中…' : '删除'}
      </button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
