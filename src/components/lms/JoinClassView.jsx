import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classes } from "../../data/lmsDemoData.js";
import { getClassByInvite, getClassBySlug, joinClass } from "../../services/classApi.js";
import { slugifyClassName } from "../../utils/hashRoutes.js";
import { Card, SectionTitle, Tag } from "./Shared.jsx";

function findClassBySlug(classSlug) {
  return classes.find((classItem) => (classItem.slug || slugifyClassName(classItem.name)) === classSlug) || null;
}

export function JoinClassView({ classSlug, currentUser = null, navigateTo }) {
  const demoClassItem = useMemo(() => findClassBySlug(classSlug), [classSlug]);
  const [classItem, setClassItem] = useState(null);
  const [loadingClass, setLoadingClass] = useState(true);
  const [usingDemoClass, setUsingDemoClass] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const autoJoinAttemptedRef = useRef("");
  const canJoin = currentUser?.id && currentUser?.role === "student";

  useEffect(() => {
    let cancelled = false;

    async function loadClassInvite() {
      setLoadingClass(true);
      setJoinError("");
      setSubmitted(false);
      setAlreadyJoined(false);

      try {
        let loadedClass = null;
        try {
          loadedClass = await getClassByInvite(classSlug);
        } catch {
          loadedClass = await getClassBySlug(classSlug);
        }

        if (!cancelled) {
          setClassItem(loadedClass);
          setUsingDemoClass(false);
        }
      } catch (error) {
        if (!cancelled) {
          setClassItem(demoClassItem);
          setUsingDemoClass(Boolean(demoClassItem));
          if (!demoClassItem) setJoinError(error.message || "Class invite could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoadingClass(false);
      }
    }

    loadClassInvite();

    return () => {
      cancelled = true;
    };
  }, [classSlug, demoClassItem]);

  const attemptJoin = useCallback(async () => {
    if (!canJoin || !classItem) return;
    setJoining(true);
    setJoinError("");

    try {
      const result = await joinClass({
        classId: classItem.id || null,
        inviteCode: classItem.inviteCode || null,
        slug: classItem.slug || classSlug,
      });
      setAlreadyJoined(Boolean(result?.alreadyJoined));
      setSubmitted(true);
    } catch (error) {
      setJoinError(error.message || "Could not join this class. Try again.");
    } finally {
      setJoining(false);
    }
  }, [canJoin, classItem, classSlug]);

  const submit = async (event) => {
    event.preventDefault();
    await attemptJoin();
  };

  useEffect(() => {
    if (!canJoin || !classItem?.id || submitted || joining) return;
    const attemptKey = `${currentUser.id}:${classItem.id}`;
    if (autoJoinAttemptedRef.current === attemptKey) return;
    autoJoinAttemptedRef.current = attemptKey;
    attemptJoin();
  }, [attemptJoin, canJoin, classItem?.id, currentUser?.id, joining, submitted]);

  if (loadingClass) {
    return (
      <main className="workspace join-class-workspace">
        <Card className="join-class-card">
          <SectionTitle
            eyebrow="Class invite"
            title="Loading class invite."
            text="Checking the invite link against the class database."
          />
          <div className="inline-status">Loading class...</div>
        </Card>
      </main>
    );
  }

  if (!classItem) {
    return (
      <main className="workspace join-class-workspace">
        <Card className="join-class-card">
          <SectionTitle
            eyebrow="Class invite"
            title="This invite link is not active."
            text="The class could not be found in the current demo data. Ask your teacher for a fresh invite link."
          />
          {joinError && <div className="inline-status error">{joinError}</div>}
          <button className="primary-action" type="button" onClick={() => navigateTo?.("home")} data-sound-click="back">
            Back to home
          </button>
        </Card>
      </main>
    );
  }

  const goToStudentAuth = (tab = "signin") => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("pendingClassInviteHash", `join-class/${classSlug}`);
      window.sessionStorage.setItem("pendingStudentAuthTab", tab);
    }
    navigateTo?.("auth-student");
  };

  return (
    <main className="workspace join-class-workspace">
      <Card className="join-class-card">
        <SectionTitle
          eyebrow="Class invite"
          title={`You are joining: ${classItem.name}`}
          text={`${classItem.teacher || "Paris Georgoulakis"} invited you to join the ${classItem.assignedBook || classItem.book || "Ultimate B2"} class workspace.`}
          action={<Tag tone="green">{classItem.students} students</Tag>}
        />
        {usingDemoClass && <div className="inline-status warning">Using demo class details because this invite was not found in the database.</div>}
        <div className="join-class-meta">
          <span>Level: {classItem.level || "B2"}</span>
          <span>Assigned book: {classItem.assignedBook || classItem.book || "Ultimate B2"}</span>
        </div>

        {submitted ? (
          <div className="join-class-success">
            <div className="inline-status success">
              {alreadyJoined ? "You are already in this class." : `You have joined ${classItem.name}.`}
            </div>
            <button className="primary-action" type="button" onClick={() => navigateTo?.("student")} data-sound-click="submit">
              Continue to student portal
            </button>
          </div>
        ) : (
          <form className="join-class-form" onSubmit={submit}>
            {joinError && <div className="inline-status error">{joinError}</div>}
            {currentUser?.id && currentUser.role !== "student" && <div className="inline-status warning">This invite is for student accounts.</div>}
            {!currentUser?.id && <div className="inline-status warning">Sign in as a student to join this class. This invite will stay available after sign-in.</div>}
            <button className="primary-action" type="submit" disabled={!canJoin || joining} data-sound-click="submit">
              {joining ? "Joining..." : "Join class"}
            </button>
            {!currentUser?.id && (
              <button className="secondary-action" type="button" onClick={() => goToStudentAuth("signin")} data-sound-click="tab">
                Sign in as student
              </button>
            )}
            {!currentUser?.id && (
              <button className="secondary-action" type="button" onClick={() => goToStudentAuth("join")} data-sound-click="tab">
                Create student account
              </button>
            )}
          </form>
        )}
      </Card>
    </main>
  );
}
