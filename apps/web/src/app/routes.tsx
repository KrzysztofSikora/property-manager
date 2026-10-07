import { Route, Routes } from 'react-router';
import { CreatePage } from '../pages/CreatePage';
import { DetailsPage } from '../pages/DetailsPage';
import { ListPage } from '../pages/ListPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { Layout } from './Layout';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ListPage />} />
        <Route path="properties/new" element={<CreatePage />} />
        <Route path="properties/:id" element={<DetailsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
