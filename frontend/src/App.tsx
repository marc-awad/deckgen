import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { DeckListPage } from "./pages/DeckListPage";
import { DeckPage } from "./pages/DeckPage";
import { NewDeckPage } from "./pages/NewDeckPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Layout route: common header, the matched page is rendered in its <Outlet /> */}
        <Route element={<Layout />}>
          <Route index element={<DeckListPage />} />
          <Route path="new" element={<NewDeckPage />} />
          <Route path="decks/:id" element={<DeckPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
