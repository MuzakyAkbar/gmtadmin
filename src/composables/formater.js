const locale = "id-ID";
export function formatDate(stringdate) {
  return new Date(stringdate).toLocaleString(locale, {
    dateStyle: "short",
  });
}
export function formatDateTime(stringdate) {
  return new Date(stringdate).toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
export function formatDateHuman(stringdate) {
  return new Date(stringdate).toLocaleString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
export function formatCurrency(value) {
  return new Intl.NumberFormat(locale).format(value);
}
