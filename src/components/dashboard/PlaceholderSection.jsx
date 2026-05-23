import Card from "../ui/Card";

export default function PlaceholderSection({ title, text, icon: Icon, action }) {
  return (
    <Card className="placeholder-section">
      <Icon size={34} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </Card>
  );
}
