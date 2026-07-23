import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  formatJaDateTime,
  formatRevisionLabel,
  type CatalogRevisionMeta,
} from '../lib/catalogHistory';
import { isCloudMode } from '../lib/mode';

const LATEST = 'latest';

type Props = {
  catalogId: string;
  /** 未保存変更があるとき版切替前に確認する */
  dirty?: boolean;
  disabled?: boolean;
  onStatus?: (msg: string) => void;
  onLoadLatest: () => void | Promise<void>;
  onLoadRevision: (revisionId: string, data: unknown) => void | Promise<void>;
  /** 親が最新を再読込したあと選択を latest に戻すためのキー */
  resetToken?: number | string;
};

export function CatalogHistoryBar({
  catalogId,
  dirty = false,
  disabled = false,
  onStatus,
  onLoadLatest,
  onLoadRevision,
  resetToken,
}: Props) {
  const [revisions, setRevisions] = useState<CatalogRevisionMeta[]>([]);
  const [latestLabel, setLatestLabel] = useState('最新');
  const [available, setAvailable] = useState(false);
  const [value, setValue] = useState(LATEST);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isCloudMode()) {
      setAvailable(false);
      setRevisions([]);
      setLatestLabel('最新（ローカル）');
      setValue(LATEST);
      return;
    }
    try {
      const r = await api.listCatalogHistory(catalogId);
      setAvailable(r.available);
      setRevisions(r.revisions);
      const when = formatJaDateTime(r.latest?.updatedAt);
      const who = r.latest?.updatedBy;
      setLatestLabel(
        when
          ? `最新（${when}${who ? ` · ${who}` : ''}）`
          : '最新（クラウド）',
      );
    } catch (e) {
      onStatus?.(String((e as Error).message || e));
    }
  }, [catalogId, onStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh, resetToken]);

  useEffect(() => {
    setValue(LATEST);
  }, [catalogId, resetToken]);

  const onChange = async (next: string) => {
    if (next === value || busy || disabled) return;
    if (
      dirty &&
      !confirm('未保存の変更があります。破棄して版を切り替えますか？')
    ) {
      return;
    }
    setBusy(true);
    try {
      if (next === LATEST) {
        await onLoadLatest();
        setValue(LATEST);
        onStatus?.('最新版を読み込みました');
      } else {
        const r = await api.getCatalogRevision(catalogId, next);
        await onLoadRevision(next, r.data);
        setValue(next);
        onStatus?.(
          `過去版を読み込みました（保存すると最新になります）: ${formatRevisionLabel(r.meta)}`,
        );
      }
      await refresh();
    } catch (e) {
      onStatus?.(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <label className="flex items-center gap-1.5 min-w-0">
        <span className="text-[var(--muted)] shrink-0">版</span>
        <select
          className="h-8 max-w-[min(100%,22rem)] rounded border border-[var(--line)] bg-[var(--input-bg)] px-2"
          value={value}
          disabled={disabled || busy || !available}
          onChange={(e) => void onChange(e.target.value)}
          title={
            available
              ? '過去版を選ぶと編集用に読み込みます。保存すると新しい最新になります。'
              : '履歴はクラウドモードでのみ利用できます'
          }
        >
          <option value={LATEST}>{latestLabel}</option>
          {revisions.map((rev) => (
            <option key={rev.id} value={rev.id}>
              過去 · {formatRevisionLabel(rev)}
            </option>
          ))}
        </select>
      </label>
      {value !== LATEST && (
        <span className="text-[var(--warn)]">
          過去版表示中 — 保存で最新化
        </span>
      )}
      {!available && (
        <span className="text-[var(--muted)]">履歴はクラウドのみ</span>
      )}
      {available && (
        <span className="text-[var(--muted)]">最大100件</span>
      )}
    </div>
  );
}
