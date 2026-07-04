// Tải .ics 1 sự kiện HRM (PA3 "Thêm vào lịch") — nghỉ phép / ngày lễ / sự kiện.
// Mở file .ics → hệ điều hành hỏi thêm vào Outlook/Google/Apple Calendar.
export async function downloadEventIcs(
  kind: 'leave' | 'holiday' | 'announcement',
  id: number,
  filename: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/bff/api/calendar/event/${kind}/${id}`, { credentials: 'include' })
    if (!res.ok) return false
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.ics`
    a.click()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}
