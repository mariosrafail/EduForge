import { Plus, Puzzle } from "lucide-react";
import Button from "../ui/Button";
import Card from "../ui/Card";

export default function ActivityTypeCard({ type, onCreate }) {
  return (
    <Card as="article" className="activity-card">
      <div className="activity-icon">
        <Puzzle size={22} />
      </div>
      <h3>{type}</h3>
      <p>Γρήγορο mock template για εκπαιδευτική δραστηριότητα.</p>
      <Button onClick={() => onCreate(type)}>
        <Plus size={17} />
        Δημιουργία
      </Button>
    </Card>
  );
}
