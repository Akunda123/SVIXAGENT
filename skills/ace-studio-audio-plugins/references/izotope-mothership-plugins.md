# iZotope mothership plug-ins: Ozone 12, Nectar 4, Neutron 5

Each hosts a signal chain of modules, and its parameter list covers every
module it can host, not only the ones in the chain. An Ozone 12 with an empty
chain still lists its Equalizer, Dynamics and Maximizer parameters.

So the parameter list is not the chain. A write to a module that is not in the
chain is accepted, reads back, and lands an undo entry — but it changes
nothing: not the editor, not the sound. Engaging the module later starts it at
its defaults, so the write is lost. Removing a module drops its settings the
same way.

Read the signal chain off the editor capture before addressing a module's
parameters, and engage the missing module in the plugin's own UI first (the
"+" at the end of the chain). The parameter list cannot tell you: a module that
is not in the chain is listed exactly like one that is.
