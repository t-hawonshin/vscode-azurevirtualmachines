{{name}}:
	gcc -g -o {{name}} main.c

clean:
	rm {{name}}

install:
	mkdir -p $(DESTDIR)/usr/bin
	install -m 0755 {{name}} $(DESTDIR)/usr/bin/{{name}}
