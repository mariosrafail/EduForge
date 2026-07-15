export function passwordsMatch(password, confirmation) {
  return Boolean(password) && password === confirmation;
}
