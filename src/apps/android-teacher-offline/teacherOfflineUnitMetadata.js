export const teacherStudentsBookUnits = [
  { number: 1, title: "Lights, Camera, Action!", available: true },
  { number: 2, title: "Journeys of Discovery", available: true },
  ...Array.from({ length: 8 }, (_, index) => ({
    number: index + 3,
    title: `Unit ${index + 3}`,
    available: false,
  })),
];

export const teacherAvailableStudentsBookUnits = teacherStudentsBookUnits.filter((unit) => unit.available);

export function teacherStudentsBookUnitTitle(number) {
  return teacherStudentsBookUnits.find((unit) => unit.number === Number(number))?.title || `Unit ${number}`;
}
