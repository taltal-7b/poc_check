import { Outlet, useParams } from 'react-router-dom';
import ProjectSubNav from '../../components/ProjectSubNav';

export default function ForumsLayout() {
  const { identifier } = useParams<{ identifier: string }>();
  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <Outlet />
    </div>
  );
}
