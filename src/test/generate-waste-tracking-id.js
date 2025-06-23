export const generateWasteTrackingId = () => {
  const firstDigits = Math.floor(Math.random() * 900 + 100)
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const randomLetters = Array(2)
    .fill()
    .map(() => letters.charAt(Math.floor(Math.random() * letters.length)))
    .join('')
  const lastDigits = Math.floor(Math.random() * 900 + 100)

  return `${firstDigits}${randomLetters}${lastDigits}`
}
