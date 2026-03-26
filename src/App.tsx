import React from "react";
import { MainWindow } from "./windows/main/MainWindow";
import { useWindowLabel } from "./hooks/useWindowLabel";

const App: React.FC = () => {
  const { windowType } = useWindowLabel();

  switch (windowType) {
    case "main":
    default:
      return <MainWindow />;
  }
};

export default App;
