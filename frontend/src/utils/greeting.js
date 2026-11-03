/**
 * Resolves appropriate dashboard greeting based on local browser time or specified timezone.
 * - Morning: 5:00 AM–11:59 AM
 * - Afternoon: 12:00 PM–4:59 PM
 * - Evening: 5:00 PM–8:59 PM
 * - Night: 9:00 PM–4:59 AM
 * @param {Date} [date=new Date()]
 * @param {string} [timeZone] Optional IANA timezone string e.g. "Asia/Kolkata", "America/New_York"
 * @returns {string}
 */
export function getGreeting(date = new Date(), timeZone) {
  let hours
  if (timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    })
    const parts = formatter.formatToParts(date)
    const hourPart = parts.find((p) => p.type === "hour")
    hours = hourPart ? Number(hourPart.value) : date.getHours()
    if (hours === 24) hours = 0
  } else {
    hours = date.getHours()
  }

  if (hours >= 5 && hours < 12) {
    return "Good morning"
  }
  if (hours >= 12 && hours < 17) {
    return "Good afternoon"
  }
  if (hours >= 17 && hours < 21) {
    return "Good evening"
  }
  return "Good night"
}
