import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import Button from "../ui/Button";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import CourseCard from "./CourseCard";

const filterOptions = [
  { label: "Όλα", value: "all" },
  { label: "Πρόχειρα", value: "Πρόχειρο" },
  { label: "Σε εξέλιξη", value: "Σε εξέλιξη" },
  { label: "Έτοιμα", value: "Έτοιμο" },
];

export default function CourseList({ courses, onOpen, onPreview, onCreateCourse, selectedCourse }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");

  const visibleCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("el-GR");
    const filtered = courses.filter((course) => {
      const matchesQuery = [course.title, course.description, course.subject, course.level]
        .join(" ")
        .toLocaleLowerCase("el-GR")
        .includes(normalizedQuery);
      const matchesFilter = filter === "all" || course.status === filter;
      return matchesQuery && matchesFilter;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "alpha") return a.title.localeCompare(b.title, "el");
      if (sort === "activities") return (b.activitiesCount ?? 0) - (a.activitiesCount ?? 0);
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [courses, filter, query, sort]);

  return (
    <section className="section-stack course-list-section">
      <div className="section-title">
        <div>
          <span className="section-kicker">Course List</span>
          <h2>Μαθήματα</h2>
          <p>Αναζήτησε, φίλτραρε και άνοιξε τα ψηφιακά μαθήματα που ετοιμάζεις.</p>
        </div>
        <span className="count-pill">{visibleCourses.length} από {courses.length}</span>
      </div>

      <Card className="course-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση μαθήματος..." />
        </label>
        <div className="filter-row">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`filter-chip ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="sort-field">
          <span>Ταξινόμηση</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ταξινόμηση μαθημάτων">
            <option value="recent">Πρόσφατα</option>
            <option value="alpha">Αλφαβητικά</option>
            <option value="activities">Περισσότερες δραστηριότητες</option>
          </select>
        </label>
      </Card>

      {visibleCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Δεν βρέθηκαν μαθήματα"
          description="Δοκίμασε άλλο φίλτρο ή δημιούργησε ένα νέο μάθημα για να ξεκινήσεις."
          action={
            <Button variant="primary" onClick={onCreateCourse}>
              Δημιουργία νέου μαθήματος
            </Button>
          }
        />
      ) : (
        <div className="course-grid polished-course-grid">
          {visibleCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              selected={selectedCourse?.id === course.id}
              onOpen={onOpen}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}

      {selectedCourse && (
        <Card className="selected-course-panel">
          <span className="section-kicker">Ανοιχτό μάθημα</span>
          <h3>{selectedCourse.title}</h3>
          <p>{selectedCourse.description}</p>
        </Card>
      )}
    </section>
  );
}
