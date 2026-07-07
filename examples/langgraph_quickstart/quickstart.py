import os
from typing_extensions import TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph


class GraphState(TypedDict):
    question: str
    draft: str
    final_answer: str


def answer_question(state: GraphState) -> dict[str, str]:
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0,
    )
    response = llm.invoke(
        [
            ("system", "You are a concise assistant. Answer in Chinese."),
            ("human", state["question"]),
        ]
    )
    return {"draft": response.content}


def polish_answer(state: GraphState) -> dict[str, str]:
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0,
    )
    response = llm.invoke(
        [
            (
                "system",
                "Rewrite the answer for a beginner. Keep the key information and answer in Chinese.",
            ),
            ("human", state["draft"]),
        ]
    )
    return {"final_answer": response.content}


def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("answer_question", answer_question)
    graph.add_node("polish_answer", polish_answer)
    graph.add_edge(START, "answer_question")
    graph.add_edge("answer_question", "polish_answer")
    graph.add_edge("polish_answer", END)
    return graph.compile()


if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit(
            "Please set OPENAI_API_KEY first. PowerShell example: "
            "$env:OPENAI_API_KEY='your_api_key'"
        )

    question = "LangGraph 和普通调用大模型有什么区别？"
    app = build_graph()
    result = app.invoke({"question": question})

    print("问题：", question)
    print("\n最终回答：")
    print(result["final_answer"])
