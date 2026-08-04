export const teacherStudentsBookUnits = [
  { number: 1, title: "Lights, Camera, Action!", available: true },
  { number: 2, title: "Journeys of Discovery", available: true },
  { number: 3, title: "Respect Our Planet", available: false },
  { number: 4, title: "Fit For Life", available: false },
  { number: 5, title: "Law and Order", available: false },
  { number: 6, title: "You're Hired!", available: false },
  { number: 7, title: "Add to Cart", available: false },
  { number: 8, title: "Making the Grade", available: false },
  { number: 9, title: "Better Together", available: false },
  { number: 10, title: "It's Just Science!", available: false },
];

export const teacherAvailableStudentsBookUnits = teacherStudentsBookUnits.filter((unit) => unit.available);

export function teacherStudentsBookUnitTitle(number) {
  return teacherStudentsBookUnits.find((unit) => unit.number === Number(number))?.title || `Unit ${number}`;
}
