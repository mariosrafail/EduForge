export const teacherStudentsBookUnits = [
  { number: 1, title: "Lights, Camera, Action!", available: true },
  { number: 2, title: "Journeys of Discovery", available: true },
  { number: 3, title: "Respect Our Planet", available: true },
  { number: 4, title: "Fit For Life", available: true },
  { number: 5, title: "Law and Order", available: true },
  { number: 6, title: "You're Hired!", available: true },
  { number: 7, title: "Add to Cart", available: true },
  { number: 8, title: "Making the Grade", available: true },
  { number: 9, title: "Better Together", available: true },
  { number: 10, title: "It's Just Science!", available: true },
];

export const teacherAvailableStudentsBookUnits = teacherStudentsBookUnits.filter((unit) => unit.available);

export function teacherStudentsBookUnitTitle(number) {
  return teacherStudentsBookUnits.find((unit) => unit.number === Number(number))?.title || `Unit ${number}`;
}

export function teacherLibraryUnitMetadata(bookSlug, pageUnits = []) {
  return pageUnits.map((unit) => {
    const number = Number(unit.number);
    return {
      number,
      title: bookSlug === "ultimate-b2" ? teacherStudentsBookUnitTitle(number) : `Unit ${number}`,
      available: true,
    };
  });
}
