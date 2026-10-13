import { Link } from "react-router";
import { PageTitle } from "../components/PageTitle";
import { secondaryButton } from "../styles";

export function NotFoundPage() {
  return (
    <>
      <PageTitle title="Page introuvable" />
      <p className="mt-2 text-slate-600">Cette adresse ne correspond à aucune page de deckgen.</p>
      <Link to="/" className={`${secondaryButton} mt-4`}>
        Retour à mes decks
      </Link>
    </>
  );
}
