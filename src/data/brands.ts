/** Original demo mark; no third-party company branding is bundled. */
export const brandDefaults = {
  example: { file: 'images/logos/example.svg', label: '示例工作室', mono: true },
} as const;
export type BrandName = keyof typeof brandDefaults;
