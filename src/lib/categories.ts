export const customCategoryColors = [
  { value: "#F5A3B7", label: "ローズ" },
  { value: "#F2C879", label: "ハニー" },
  { value: "#A7D86F", label: "リーフ" },
  { value: "#7ED7C1", label: "シーフォーム" },
  { value: "#8CCCF0", label: "スカイ" },
  { value: "#B7B4F3", label: "ラベンダー" },
];

const customCategoryColorValues = new Set(customCategoryColors.map((color) => color.value));

export function getCustomCategoryColor(value: string) {
  return customCategoryColorValues.has(value) ? value : customCategoryColors[0].value;
}
