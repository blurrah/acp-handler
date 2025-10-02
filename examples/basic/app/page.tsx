"use client";

import { useChat } from "@ai-sdk/react";

export default function ChatDemo() {
	const { messages, input, handleInputChange, handleSubmit, isLoading } =
		useChat({
			api: "/api/chat",
		});

	return (
		<div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">Agentic Checkout Demo</h1>
				<p className="text-gray-600">
					Simulate ChatGPT interacting with your checkout endpoints
				</p>
			</div>

			<div className="flex-1 overflow-y-auto space-y-4 mb-4 border rounded-lg p-4">
				{messages.length === 0 && (
					<div className="text-center text-gray-500 mt-8">
						<p className="mb-2">Try asking:</p>
						<ul className="space-y-1 text-sm">
							<li>"I want to buy product-1 and product-2"</li>
							<li>"Create a checkout with 2 units of product-1"</li>
							<li>"Add my shipping address"</li>
						</ul>
					</div>
				)}

				{messages.map((message) => (
					<div
						key={message.id}
						className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
					>
						<div
							className={`max-w-[80%] rounded-lg px-4 py-2 ${
								message.role === "user"
									? "bg-blue-500 text-white"
									: "bg-gray-100 text-gray-900"
							}`}
						>
							<div className="text-sm font-semibold mb-1">
								{message.role === "user" ? "You" : "Agent"}
							</div>
							<div className="whitespace-pre-wrap">{message.content}</div>

							{message.toolInvocations && (
								<div className="mt-2 pt-2 border-t border-gray-300 space-y-2">
									{message.toolInvocations.map((tool) => (
										<div key={tool.toolCallId} className="text-xs">
											<div className="font-mono font-semibold">
												🔧 {tool.toolName}
											</div>
											{tool.state === "result" && (
												<pre className="mt-1 p-2 bg-gray-50 rounded overflow-x-auto">
													{JSON.stringify(tool.result, null, 2)}
												</pre>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				))}

				{isLoading && (
					<div className="flex justify-start">
						<div className="bg-gray-100 rounded-lg px-4 py-2">
							<div className="text-sm font-semibold mb-1">Agent</div>
							<div className="text-gray-500">Thinking...</div>
						</div>
					</div>
				)}
			</div>

			<form onSubmit={handleSubmit} className="flex gap-2">
				<input
					type="text"
					value={input}
					onChange={handleInputChange}
					placeholder="Ask the agent to help with checkout..."
					className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					disabled={isLoading}
				/>
				<button
					type="submit"
					disabled={isLoading}
					className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Send
				</button>
			</form>
		</div>
	);
}
