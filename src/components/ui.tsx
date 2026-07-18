import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react';

/** 管理画面コントロールの統一高さ（32px） */
export const UI_CONTROL_H = 'h-8';
export const UI_CONTROL_TEXT = 'text-[11px]';

const baseField =
  `ui-control ${UI_CONTROL_H} ${UI_CONTROL_TEXT} box-border rounded border border-[var(--line)] bg-[var(--input-bg)] px-2.5 ` +
  'disabled:opacity-40 focus:outline-none focus:border-[var(--accent)]';

const baseBtn =
  `ui-control ${UI_CONTROL_H} ${UI_CONTROL_TEXT} box-border inline-flex items-center justify-center gap-1 rounded border px-2.5 ` +
  'disabled:opacity-40 shrink-0 whitespace-nowrap';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** ページ上部の説明文（タイトルなし想定） */
export function PageDesc({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cx('text-[11px] text-[var(--muted)] leading-snug', className)}>
      {children}
    </p>
  );
}

export function UiInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(baseField, className)} />;
}

export function UiSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(baseField, 'pr-7 appearance-auto', className)}
    >
      {children}
    </select>
  );
}

export function UiTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        UI_CONTROL_TEXT,
        'box-border min-h-[3.5rem] rounded border border-[var(--line)] bg-[var(--input-bg)] px-2.5 py-1.5',
        'disabled:opacity-40 focus:outline-none focus:border-[var(--accent)]',
        className,
      )}
    />
  );
}

type BtnVariant = 'default' | 'accent' | 'ghost' | 'danger';

export function UiButton({
  className,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const variantCls =
    variant === 'accent'
      ? 'border-transparent bg-[var(--accent)] text-[var(--bg)]'
      : variant === 'ghost'
        ? 'border-transparent bg-transparent hover:bg-[var(--hover)]'
        : variant === 'danger'
          ? 'border-[var(--danger)]/50 bg-[var(--input-bg)] text-[var(--danger)]'
          : 'border-[var(--line)] bg-[var(--input-bg)] hover:bg-[var(--hover)]';
  return (
    <button
      type="button"
      {...props}
      className={cx(baseBtn, variantCls, className)}
    />
  );
}

/** リスト右詰のメタラベル（専用キャラ・部位など） */
export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto shrink-0 rounded bg-[var(--hover)] px-1.5 py-0.5 text-[9px] text-[var(--muted)] leading-none">
      {children}
    </span>
  );
}

export function equipSlotLabelJa(slot: unknown): string {
  const s = String(slot ?? '').trim();
  switch (s) {
    case 'Weapon':
      return '武器';
    case 'Armor':
      return '防具';
    case 'Accessory':
      return 'アクセサリ';
    default:
      return s || '—';
  }
}
